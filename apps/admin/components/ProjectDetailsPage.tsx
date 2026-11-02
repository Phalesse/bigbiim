'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatMinorAmount } from '@/lib/format';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorText(error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return 'Connectez-vous avec un compte administrateur autorisé pour consulter ce projet.';
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function date(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('fr-FR');
}

function getTimeline(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of ['items', 'events', 'timeline']) {
    if (Array.isArray(payload[key])) return (payload[key] as unknown[]).filter(isRecord);
  }
  return [];
}

function getCollection(payload: unknown, key: string): JsonRecord[] {
  if (!isRecord(payload) || !Array.isArray(payload[key])) return [];
  return (payload[key] as unknown[]).filter(isRecord);
}

export default function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<JsonRecord | null>(null);
  const [timeline, setTimeline] = useState<JsonRecord[]>([]);
  const [steps, setSteps] = useState<JsonRecord[]>([]);
  const [milestones, setMilestones] = useState<JsonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api<unknown>(`/projects/${encodeURIComponent(id)}`),
      api<unknown>(`/projects/${encodeURIComponent(id)}/timeline`),
    ]).then(([projectResponse, timelineResponse]) => {
      if (!active) return;
      const record = isRecord(projectResponse) && isRecord(projectResponse.project)
        ? projectResponse.project
        : isRecord(projectResponse) ? projectResponse : null;
      setProject(record);
      setTimeline(getTimeline(timelineResponse));
      setSteps(getCollection(timelineResponse, 'steps'));
      setMilestones(record ? getCollection(record, 'milestones') : getCollection(timelineResponse, 'milestones'));
    }).catch((loadError: unknown) => {
      if (active) setError(errorText(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="loading-state">Chargement du projet…</div>;
  if (error) return <div className="error-banner" role="alert"><span aria-hidden="true">!</span><div><strong>Projet indisponible</strong>{error}</div></div>;
  if (!project) return <div className="empty-state">Aucun détail disponible pour ce projet.</div>;

  const currency = typeof project.currency === 'string' ? project.currency : '';
  const amount = currency && (typeof project.totalAmount === 'number' || typeof project.totalAmount === 'string')
    ? formatMinorAmount(project.totalAmount, currency)
    : '—';

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow"><Link href="/projets">Projets</Link> / {id.slice(0, 8)}</p><h1>Supervision du projet</h1><p>Consultation du dossier et de la chronologie. Les actions financières et changements d’équipe restent soumis aux règles serveur.</p></div>
        <span className="status-pill status-info">{display(project.status).replaceAll('_', ' ')}</span>
      </div>
      <section className="content-card">
        <div className="detail-grid">
          <div><span className="detail-label">Référence</span><strong>{display(project.id ?? id)}</strong></div>
          <div><span className="detail-label">Statut</span><strong>{display(project.status).replaceAll('_', ' ')}</strong></div>
          <div><span className="detail-label">Ville</span><strong>{display(project.city)}</strong></div>
          <div><span className="detail-label">Montant estimé</span><strong>{amount}</strong></div>
          <div><span className="detail-label">Devise</span><strong>{display(project.currency)}</strong></div>
          <div><span className="detail-label">Date souhaitée</span><strong>{date(project.targetDate)}</strong></div>
          <div><span className="detail-label">Créé le</span><strong>{date(project.createdAt)}</strong></div>
          <div><span className="detail-label">Version activité</span><strong>{display(project.activityVersionId)}</strong></div>
        </div>
        {isRecord(project.answers) && Object.keys(project.answers).length > 0 && (
          <div className="section-spacer">
            <h2 className="detail-heading">Réponses du questionnaire</h2>
            <pre className="json-preview">{JSON.stringify(project.answers, null, 2)}</pre>
          </div>
        )}
        {steps.length > 0 && (
          <div className="section-spacer">
            <h2 className="detail-heading">Étapes</h2>
            <div className="compact-record-list">
              {steps.map((step, index) => (
                <div className="compact-record" key={String(step.id ?? index)}>
                  <strong>{display(step.key ?? step.name ?? `Étape ${index + 1}`).replaceAll('_', ' ')}</strong>
                  <span>{display(step.status).replaceAll('_', ' ')}</span>
                  <small>{date(step.plannedStart)} – {date(step.plannedEnd)}</small>
                </div>
              ))}
            </div>
          </div>
        )}
        {milestones.length > 0 && (
          <div className="section-spacer">
            <h2 className="detail-heading">Jalons</h2>
            <div className="compact-record-list">
              {milestones.map((milestone, index) => {
                const milestoneAmount = currency && (typeof milestone.amount === 'number' || typeof milestone.amount === 'string')
                  ? formatMinorAmount(milestone.amount, currency)
                  : '—';
                return (
                  <div className="compact-record" key={String(milestone.id ?? index)}>
                    <strong>{display(milestone.title ?? milestone.name ?? milestone.id ?? `Jalon ${index + 1}`)}</strong>
                    <span>{display(milestone.status).replaceAll('_', ' ')}</span>
                    <small>{milestoneAmount}</small>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {isRecord(project.quote) && (
          <div className="section-spacer">
            <h2 className="detail-heading">Dernier devis</h2>
            <div className="detail-grid">
              <div><span className="detail-label">Total</span><strong>{currency && typeof project.quote.total === 'number' ? formatMinorAmount(project.quote.total, currency) : '—'}</strong></div>
              <div><span className="detail-label">Version</span><strong>{display(project.quote.version)}</strong></div>
              <div><span className="detail-label">Valide jusqu’au</span><strong>{date(project.quote.validUntil)}</strong></div>
              <div><span className="detail-label">Expiration</span><strong>{project.quote.expired === true ? 'Expiré' : 'Valide'}</strong></div>
            </div>
          </div>
        )}
      </section>
      <section className="panel section-spacer">
        <div className="panel-header"><div><h2>Chronologie du projet</h2><p>Événements enregistrés par le système</p></div></div>
        {timeline.length === 0 ? <div className="empty-state">Aucun événement de chronologie disponible.</div> : (
          <div className="timeline-list">
            {timeline.map((item, index) => {
              const label = item.type ?? item.event ?? item.status ?? 'Événement';
              const description = item.description ?? item.message ?? item.detail;
              return (
                <article className="timeline-item" key={String(item.id ?? `${display(label)}-${index}`)}>
                  <span className="timeline-marker" />
                  <div className="timeline-content">
                    <div className="timeline-heading"><strong>{display(label).replaceAll('_', ' ')}</strong><time>{date(item.at ?? item.createdAt ?? item.timestamp)}</time></div>
                    {description !== undefined && <p>{display(description)}</p>}
                    {isRecord(item.payload) && <pre className="json-preview timeline-payload">{JSON.stringify(item.payload, null, 2)}</pre>}
                    {item.actorId && <small>Acteur : {display(item.actorId)}</small>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
