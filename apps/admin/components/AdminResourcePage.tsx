'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { formatMinorAmount } from '@/lib/format';

type ResourceRecord = Record<string, unknown>;

type Column = {
  key: string;
  label: string;
  format?: 'status' | 'date' | 'amount';
};

type RowAction = { kind: 'verify' | 'reject' | 'suspend' | 'decide'; label: string };

type Props = {
  title: string;
  description: string;
  endpoint: string;
  columns: Column[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  action?: { label: string; href: string };
  rowLinkTemplate?: string;
  actionBase?: string;
  rowActions?: RowAction[];
};

function getRows(payload: unknown): ResourceRecord[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : [];
  return rows.filter((row): row is ResourceRecord => !!row && typeof row === 'object' && !Array.isArray(row));
}

function getNextCursor(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const cursor = (payload as { nextCursor?: unknown }).nextCursor;
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
}

function valueFor(row: ResourceRecord, key: string): unknown {
  return key.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, row);
}

function displayValue(value: unknown, format?: Column['format'], currency?: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'date' && (typeof value === 'string' || typeof value === 'number')) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('fr-FR');
  }
  if (format === 'amount' && (typeof value === 'number' || typeof value === 'string') && typeof currency === 'string') {
    return formatMinorAmount(value, currency);
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value).replaceAll('_', ' ');
}

function statusColor(value: unknown) {
  const status = String(value ?? '').toUpperCase();
  if (['TERMINE', 'CLOTURE', 'PUBLIE', 'VERIFIE', 'VALIDE', 'ACCEPTE', 'SUCCES'].includes(status)) return 'status-success';
  if (['REFUSE', 'ANNULE', 'SUSPENDU', 'EN_LITIGE', 'ECHEC'].includes(status)) return 'status-danger';
  if (['EN_COURS', 'BROUILLON', 'EN_ATTENTE', 'OUVERT'].includes(status)) return 'status-warning';
  return 'status-info';
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return 'Connectez-vous avec un compte administrateur autorisé pour consulter ces données.';
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

export default function AdminResourcePage({
  title,
  description,
  endpoint,
  columns,
  searchPlaceholder = 'Rechercher dans les résultats…',
  emptyMessage = 'Aucun résultat pour le moment.',
  action,
  rowLinkTemplate,
  actionBase,
  rowActions = [],
}: Props) {
  const [rows, setRows] = useState<ResourceRecord[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError('');
    try {
      const requestUrl = cursor
        ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`
        : endpoint;
      const response = await api<unknown>(requestUrl);
      setRows((current) => cursor ? [...(current ?? []), ...getRows(response)] : getRows(response));
      setNextCursor(getNextCursor(response));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const query = search.trim().toLocaleLowerCase('fr');
    if (!query) return rows;
    return rows.filter((row) => columns.some((column) =>
      String(valueFor(row, column.key) ?? '').toLocaleLowerCase('fr').includes(query),
    ));
  }, [columns, rows, search]);

  function exportCsv() {
    if (!filteredRows.length) return;
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines = [
      columns.map((column) => escape(column.label)).join(';'),
      ...filteredRows.map((row) => columns.map((column) =>
        escape(displayValue(valueFor(row, column.key), column.format, valueFor(row, 'currency'))),
      ).join(';')),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title.toLocaleLowerCase('fr').replaceAll(' ', '-')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function performAction(row: ResourceRecord, actionKind: RowAction['kind']) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id || !actionBase) return;
    let body: Record<string, unknown> = {};
    if (actionKind === 'verify') {
      const rawLevel = window.prompt('Niveau KYC à valider (1 à 3)', '1');
      if (rawLevel === null) return;
      const kycLevel = Number(rawLevel);
      if (!Number.isInteger(kycLevel) || kycLevel < 1 || kycLevel > 3) {
        setActionError('Le niveau KYC doit être un entier entre 1 et 3.');
        return;
      }
      if (!window.confirm(`Confirmer le niveau KYC ${kycLevel} pour ce prestataire ?`)) return;
      body = { kycLevel };
    } else if (actionKind === 'decide') {
      const resolution = window.prompt('Saisissez la résolution retenue (2 à 120 caractères).');
      if (resolution === null) return;
      if (resolution.trim().length < 2 || resolution.trim().length > 120) {
        setActionError('La résolution doit contenir entre 2 et 120 caractères.');
        return;
      }
      const reason = window.prompt('Expliquez le motif de la décision (5 à 2000 caractères).');
      if (reason === null) return;
      if (reason.trim().length < 5 || reason.trim().length > 2000) {
        setActionError('Le motif doit contenir entre 5 et 2000 caractères.');
        return;
      }
      if (!window.confirm('Enregistrer définitivement cette décision de litige ?')) return;
      body = { decision: { resolution: resolution.trim(), reason: reason.trim() } };
    } else {
      const verb = actionKind === 'reject' ? 'Refuser' : 'Suspendre';
      const reason = window.prompt(`${verb} ce prestataire. Indiquez un motif (5 à 1000 caractères).`);
      if (reason === null) return;
      if (reason.trim().length < 5 || reason.trim().length > 1000) {
        setActionError('Le motif doit contenir entre 5 et 1000 caractères.');
        return;
      }
      body = { reason: reason.trim() };
    }

    setActingId(id);
    setActionError('');
    setNotice('');
    try {
      const endpointAction = actionKind === 'decide' ? 'decision' : actionKind;
      await api(`${actionBase}/${encodeURIComponent(id)}/${endpointAction}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setNotice(actionKind === 'verify' ? 'Niveau KYC enregistré.' : actionKind === 'reject' ? 'Prestataire refusé.' : actionKind === 'suspend' ? 'Prestataire suspendu.' : 'Décision de litige enregistrée.');
      await load();
    } catch (actionRequestError) {
      setActionError(getErrorMessage(actionRequestError));
    } finally {
      setActingId(null);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Administration</p><h1>{title}</h1><p>{description}</p></div>
        {action ? <Link href={action.href} className="button-primary">{action.label}</Link> : null}
      </div>
      <div className="filter-row">
        <input
          className="field-control"
          style={{ minWidth: 250 }}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
        <button className="button-secondary" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Actualisation…' : '↻ Actualiser'}
        </button>
        <button className="button-secondary" type="button" onClick={exportCsv} disabled={!filteredRows.length}>
          ↓ Exporter CSV
        </button>
        {rows && <span className="muted-note">{filteredRows.length} résultat{filteredRows.length > 1 ? 's' : ''}</span>}
      </div>
      {error && <div className="error-banner" role="alert"><span aria-hidden="true">!</span><div><strong>Impossible de charger les données</strong>{error}</div></div>}
      {actionError && <div className="error-banner section-spacer" role="alert"><span aria-hidden="true">!</span><div><strong>Action impossible</strong>{actionError}</div></div>}
      {notice && <div className="callout section-spacer" role="status">{notice}</div>}
      <section className="panel section-spacer">
        {loading && rows === null ? <div className="loading-state">Chargement des données…</div> : null}
        {!loading && rows?.length === 0 && !error ? <div className="empty-state">{emptyMessage}</div> : null}
        {rows && rows.length > 0 ? (
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}{rowActions.length > 0 && <th>Actions</th>}</tr></thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={String(row.id ?? row.key ?? index)}>
                    {columns.map((column) => {
                      const value = valueFor(row, column.key);
                      const rowId = typeof row.id === 'string' ? row.id : '';
                      const rowHref = rowLinkTemplate && rowId
                        ? rowLinkTemplate.replace(':id', encodeURIComponent(rowId))
                        : null;
                      return (
                        <td key={column.key}>
                          {rowHref && column === columns[0]
                            ? <Link className="table-primary table-primary-link" href={rowHref}>{displayValue(value, column.format, valueFor(row, 'currency'))}</Link>
                            : column.format === 'status'
                            ? <span className={`status-pill ${statusColor(value)}`}>{displayValue(value)}</span>
                            : displayValue(value, column.format, valueFor(row, 'currency'))}
                        </td>
                      );
                    })}
                    {rowActions.length > 0 && <td><div className="row-actions">{rowActions.map((action) => <button className="table-action" key={action.kind} type="button" onClick={() => void performAction(row, action.kind)} disabled={loading || actingId === String(row.id)}>{actingId === String(row.id) ? 'En cours…' : action.label}</button>)}</div></td>}
                  </tr>
                ))}
                {filteredRows.length === 0 && <tr><td colSpan={columns.length + (rowActions.length ? 1 : 0)} className="empty-state">Aucun résultat ne correspond à cette recherche.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {nextCursor && <div className="action-row"><button className="button-secondary" type="button" onClick={() => void load(nextCursor)} disabled={loading}>{loading ? 'Chargement…' : 'Charger la suite'}</button></div>}
    </>
  );
}
