'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatMinorAmount } from '@/lib/format';

type AdminOverview = {
  projects: {
    total: number;
    active: number;
    activeAmounts: { currency: string; amount: string }[];
  };
  providers: { verified: number };
  disputes: { open: number };
  asOf: string;
};

type Project = {
  id: string;
  status: string;
  city?: string | null;
  currency: string;
  totalAmount?: number | null;
  createdAt: string;
};

type ProjectList = { items: Project[]; nextCursor: string | null };

function formatAmount(amount: number | null | undefined, currency: string) {
  return formatMinorAmount(amount, currency);
}

function statusClass(status: string) {
  if (['TERMINE', 'CLOTURE', 'CONFIRME'].includes(status)) return 'status-success';
  if (['EN_LITIGE', 'ANNULE', 'ABANDONNE'].includes(status)) return 'status-danger';
  if (['EN_COURS', 'EQUIPE', 'CONTRAT'].includes(status)) return 'status-info';
  return 'status-warning';
}

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'Votre session administrateur est absente ou ne dispose pas du rôle requis. Connectez-vous avec un compte administrateur puis réessayez.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

export default function Page() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [overviewError, setOverviewError] = useState('');
  const [projectsError, setProjectsError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api<AdminOverview>('/admin/kpis')
        .then((data) => { if (active) setOverview(data); })
        .catch((error: unknown) => { if (active) setOverviewError(errorText(error)); }),
      api<ProjectList>('/projects?limit=5')
        .then((data) => { if (active) setProjects(data.items); })
        .catch((error: unknown) => { if (active) setProjectsError(errorText(error)); }),
    ]).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const activeAmountSummary = overview?.projects.activeAmounts
    .map(({ amount, currency }) => formatMinorAmount(amount, currency))
    .join(' · ');

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Vue d’ensemble</p>
          <h1>Bonjour, administrateur</h1>
          <p>Voici ce qui se passe sur votre plateforme aujourd’hui.</p>
        </div>
        <Link href="/activites" className="button-primary"><span aria-hidden="true">＋</span> Créer une activité</Link>
      </div>

      <section className="stats-grid" aria-label="Indicateurs clés">
        <article className="stat-card">
          <div className="stat-card-top"><span className="stat-label">Projets au total</span><span className="stat-icon">▦</span></div>
          <p className="stat-value">{loading ? '—' : overview?.projects.total ?? '—'}</p>
          <span className="stat-footnote">Toutes les demandes enregistrées</span>
        </article>
        <article className="stat-card">
          <div className="stat-card-top"><span className="stat-label">Projets en cours</span><span className="stat-icon green">↗</span></div>
          <p className="stat-value">{loading ? '—' : overview?.projects.active ?? '—'}</p>
          <span className="stat-footnote">{activeAmountSummary ? `Montants engagés : ${activeAmountSummary}` : 'Confirmés, en cours ou en litige'}</span>
        </article>
        <article className="stat-card">
          <div className="stat-card-top"><span className="stat-label">Prestataires vérifiés</span><span className="stat-icon orange">♙</span></div>
          <p className="stat-value">{loading ? '—' : overview?.providers.verified ?? '—'}</p>
          <span className="stat-footnote">Avec au moins un niveau KYC validé</span>
        </article>
        <article className="stat-card">
          <div className="stat-card-top"><span className="stat-label">Litiges à traiter</span><span className="stat-icon red">◇</span></div>
          <p className="stat-value">{loading ? '—' : overview?.disputes.open ?? '—'}</p>
          <span className="stat-footnote">Dossiers sans décision enregistrée</span>
        </article>
      </section>

      {overviewError && (
        <div className="error-banner section-spacer" role="alert">
          <span aria-hidden="true">!</span>
          <div><strong>Indicateurs indisponibles</strong>{overviewError}</div>
        </div>
      )}

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div><h2>Projets récents</h2><p>Dernières demandes enregistrées</p></div>
            <Link href="/projets" className="panel-link">Voir tous les projets <span aria-hidden="true">→</span></Link>
          </div>
          {projectsError ? (
            <div className="error-banner" style={{ margin: 16 }} role="alert">
              <span aria-hidden="true">!</span><div><strong>Liste indisponible</strong>{projectsError}</div>
            </div>
          ) : projects === null ? (
            <div className="loading-state">Chargement des projets…</div>
          ) : projects.length === 0 ? (
            <div className="empty-state">Aucun projet à afficher pour le moment.</div>
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead><tr><th>Projet</th><th>Ville</th><th>Montant</th><th>Statut</th></tr></thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id}>
                      <td><span className="table-primary">#{project.id.slice(0, 8)}</span><div className="table-secondary">{new Date(project.createdAt).toLocaleDateString('fr-FR')}</div></td>
                      <td>{project.city || '—'}</td>
                      <td>{formatAmount(project.totalAmount, project.currency)}</td>
                      <td><span className={`status-pill ${statusClass(project.status)}`}>{project.status.replaceAll('_', ' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header"><div><h2>Accès rapides</h2><p>Les tâches fréquentes de l’équipe</p></div></div>
          <div className="quick-actions">
            <Link href="/prestataires" className="quick-action"><span>Examiner les prestataires</span><span aria-hidden="true">→</span></Link>
            <Link href="/litiges" className="quick-action"><span>Consulter les litiges</span><span aria-hidden="true">→</span></Link>
            <Link href="/activites" className="quick-action"><span>Gérer le catalogue</span><span aria-hidden="true">→</span></Link>
            <Link href="/audit" className="quick-action"><span>Ouvrir le journal d’audit</span><span aria-hidden="true">→</span></Link>
          </div>
        </section>
      </div>

      <p className="muted-note" style={{ marginTop: 16 }}>
        Les données sont chargées depuis l’API BIGBIIM. Les montants des projets actifs ne représentent pas un revenu comptable.
      </p>
    </>
  );
}
