'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatMinorAmount } from '@/lib/format';

type Overview = {
  projects: { total: number; active: number; activeAmounts: { currency: string; amount: string }[] };
  providers: { verified: number };
  disputes: { open: number };
  asOf: string;
};

function errorText(error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return 'Connectez-vous avec un compte administrateur autorisé pour consulter les indicateurs.';
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

export default function ReportsAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await api<Overview>('/admin/kpis'));
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function exportCsv() {
    if (!data) return;
    const rows = [
      ['Indicateur', 'Valeur'],
      ['Projets au total', String(data.projects.total)],
      ['Projets actifs', String(data.projects.active)],
      ['Prestataires vérifiés', String(data.providers.verified)],
      ['Litiges sans décision', String(data.disputes.open)],
      ...data.projects.activeAmounts.map((item) => [`Montant engagé (${item.currency})`, formatMinorAmount(item.amount, item.currency)]),
      ['Calculé le', data.asOf],
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'rapport-bigbiim.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Analyses</p><h1>Rapports</h1><p>Indicateurs opérationnels calculés à partir des données actuelles de la plateforme.</p></div>
        <button className="button-secondary" type="button" onClick={exportCsv} disabled={!data}>↓ Exporter CSV</button>
      </div>
      <div className="filter-row">
        <span className="muted-note">{data ? `Données calculées le ${new Date(data.asOf).toLocaleString('fr-FR')}` : 'Aucune donnée chargée'}</span>
        <button className="button-secondary" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualisation…' : '↻ Actualiser'}</button>
      </div>
      {error && <div className="error-banner section-spacer" role="alert"><span aria-hidden="true">!</span><div><strong>Rapport indisponible</strong>{error}</div></div>}
      {loading && !data ? <div className="loading-state">Chargement des indicateurs…</div> : null}
      {data && (
        <>
          <div className="stats-grid">
            <article className="stat-card"><div className="stat-card-top"><span className="stat-label">Projets au total</span><span className="stat-icon">▦</span></div><p className="stat-value">{data.projects.total}</p><span className="stat-footnote">Toutes périodes confondues</span></article>
            <article className="stat-card"><div className="stat-card-top"><span className="stat-label">Projets actifs</span><span className="stat-icon green">↗</span></div><p className="stat-value">{data.projects.active}</p><span className="stat-footnote">Confirmés, en cours ou en litige</span></article>
            <article className="stat-card"><div className="stat-card-top"><span className="stat-label">Prestataires vérifiés</span><span className="stat-icon orange">♙</span></div><p className="stat-value">{data.providers.verified}</p><span className="stat-footnote">KYC niveau 1 ou supérieur</span></article>
            <article className="stat-card"><div className="stat-card-top"><span className="stat-label">Litiges en attente</span><span className="stat-icon red">◇</span></div><p className="stat-value">{data.disputes.open}</p><span className="stat-footnote">Sans décision enregistrée</span></article>
          </div>
          <section className="content-card section-spacer">
            <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>Montants engagés par devise</h2>
            <p className="muted-note">Somme des montants des projets confirmés, en cours ou en litige. Ce chiffre n’est pas assimilé à un revenu encaissé.</p>
            {data.projects.activeAmounts.length ? <div className="metric-strip section-spacer">{data.projects.activeAmounts.map((item) => <strong key={item.currency}>{formatMinorAmount(item.amount, item.currency)}</strong>)}</div> : <p className="empty-state">Aucun montant de projet actif à agréger.</p>}
          </section>
        </>
      )}
    </>
  );
}
