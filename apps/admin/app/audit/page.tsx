'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api } from '@/lib/api';

type AuditLog = {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  at: string;
};

type AuditLogResponse = {
  items: AuditLog[];
  nextCursor: string | null;
};

type Filters = {
  actorId: string;
  action: string;
  entity: string;
};

const PAGE_SIZE = 100;

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return 'Connectez-vous avec un compte administrateur autorisé pour consulter ces données.';
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('fr-FR');
}

function exportCsv(items: AuditLog[]) {
  if (items.length === 0) return;

  const escape = (value: string | null) => {
    const text = value ?? '';
    const safeText = /^[\s=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };
  const columns = [
    { label: 'Date', value: (item: AuditLog) => formatDate(item.at) },
    { label: 'Acteur', value: (item: AuditLog) => item.actorId },
    { label: 'Action', value: (item: AuditLog) => item.action },
    { label: 'Ressource', value: (item: AuditLog) => item.entity },
    { label: 'Identifiant', value: (item: AuditLog) => item.entityId },
    { label: 'Adresse IP', value: (item: AuditLog) => item.ip },
  ];
  const lines = [
    columns.map((column) => escape(column.label)).join(';'),
    ...items.map((item) => columns.map((column) => escape(column.value(item))).join(';')),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'journal-audit.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Page() {
  const [filters, setFilters] = useState<Filters>({ actorId: '', action: '', entity: '' });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ actorId: '', action: '', entity: '' });
  const [cursor, setCursor] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });

    for (const [key, value] of Object.entries(appliedFilters)) {
      if (value) query.set(key, value);
    }
    if (cursor) query.set('cursor', cursor);

    setLoading(true);
    setError('');
    setLogs(null);
    setNextCursor(null);

    void api<AuditLogResponse>(`/admin/audit-logs?${query.toString()}`, { signal: controller.signal })
      .then((response) => {
        setLogs(response.items);
        setNextCursor(response.nextCursor);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [appliedFilters, cursor]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCursor(null);
    setAppliedFilters({
      actorId: filters.actorId.trim(),
      action: filters.action.trim(),
      entity: filters.entity.trim(),
    });
  }

  function clearFilters() {
    const emptyFilters = { actorId: '', action: '', entity: '' };
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setCursor(null);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Journal d’audit</h1>
          <p>Consultez les actions sensibles enregistrées sur la plateforme.</p>
        </div>
        <button
          className="button-secondary"
          type="button"
          onClick={() => exportCsv(logs ?? [])}
          disabled={!logs?.length}
        >
          ↓ Exporter cette page en CSV
        </button>
      </div>

      <form className="filter-row" onSubmit={applyFilters}>
        <label className="form-field">
          <span className="field-label">Identifiant exact de l’acteur</span>
          <input
            className="field-control"
            value={filters.actorId}
            onChange={(event) => setFilters({ ...filters, actorId: event.target.value })}
            placeholder="Ex. utilisateur ou administrateur"
          />
        </label>
        <label className="form-field">
          <span className="field-label">Action</span>
          <input
            className="field-control"
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value })}
            placeholder="Ex. SETTING_UPDATED"
          />
        </label>
        <label className="form-field">
          <span className="field-label">Ressource</span>
          <input
            className="field-control"
            value={filters.entity}
            onChange={(event) => setFilters({ ...filters, entity: event.target.value })}
            placeholder="Ex. Setting"
          />
        </label>
        <button className="button-primary" type="submit" disabled={loading}>
          Appliquer
        </button>
        <button className="button-secondary" type="button" onClick={clearFilters} disabled={loading}>
          Effacer
        </button>
      </form>

      {error && (
        <div className="error-banner" role="alert">
          <span aria-hidden="true">!</span>
          <div>
            <strong>Impossible de charger le journal</strong>
            {error}
          </div>
        </div>
      )}

      <section className="panel section-spacer" aria-label="Actions enregistrées">
        {loading && <div className="loading-state" role="status">Chargement du journal d’audit…</div>}
        {!loading && logs?.length === 0 && !error && (
          <div className="empty-state">Aucune action ne correspond à ces filtres.</div>
        )}
        {logs && logs.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Acteur</th>
                    <th>Action</th>
                    <th>Ressource</th>
                    <th>Identifiant</th>
                    <th>Adresse IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.at)}</td>
                      <td>{log.actorId ?? 'Système'}</td>
                      <td><span className="table-primary">{log.action.replaceAll('_', ' ')}</span></td>
                      <td>{log.entity}</td>
                      <td>{log.entityId ?? '—'}</td>
                      <td>{log.ip ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="metric-strip">
              <span>{logs.length} événement{logs.length > 1 ? 's' : ''} affiché{logs.length > 1 ? 's' : ''}</span>
              <span>Les événements les plus récents apparaissent en premier.</span>
            </div>
          </>
        )}
      </section>

      {nextCursor && (
        <div className="action-row">
          <button
            className="button-secondary"
            type="button"
            onClick={() => setCursor(nextCursor)}
            disabled={loading}
          >
            Charger les événements précédents
          </button>
        </div>
      )}
    </>
  );
}
