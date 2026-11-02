'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';

type Section =
  | 'informations'
  | 'questionnaire'
  | 'roles'
  | 'etapes'
  | 'prix'
  | 'jalons'
  | 'contrat'
  | 'conformite'
  | 'simulation'
  | 'publication';

type Activity = {
  id: string;
  slug: string;
  sectorId: string;
  countryCode: string | null;
  status: string;
};

type SectorOption = { id: string; nameI18n: unknown };

type DraftDocument = {
  activity: Activity;
  draft: { id: string; version: number; definition: Record<string, unknown> };
};

type BuilderResult = {
  valid?: boolean;
  errors?: string[];
  preview?: {
    roleCount: number;
    stepCount: number;
    milestoneCount: number;
    questionnaireFieldCount: number;
  } | null;
  note?: string;
  publishedVersion?: number;
  nextDraftVersion?: number;
};

const sections: { id: Section; label: string; property?: string; help: string }[] = [
  { id: 'informations', label: 'Informations', help: 'Nom, secteur, description et zones où l’activité est proposée.' },
  { id: 'questionnaire', label: 'Questionnaire', property: 'questionnaire', help: 'Décrivez les champs dynamiques, validations et conditions en JSON.' },
  { id: 'roles', label: 'Rôles', property: 'roles', help: 'Définissez les compétences, quantités, tarifs et règles de matching.' },
  { id: 'etapes', label: 'Étapes', property: 'steps', help: 'Décrivez les phases du projet et leurs dépendances.' },
  { id: 'prix', label: 'Prix et règles', property: 'pricing', help: 'Configurez la devise, les formules de prix et les remises.' },
  { id: 'jalons', label: 'Jalons', property: 'milestones', help: 'Répartissez les paiements et précisez les preuves attendues.' },
  { id: 'contrat', label: 'Contrat', property: 'contract_template_id', help: 'Renseignez l’identifiant du modèle de contrat associé.' },
  { id: 'conformite', label: 'Conformité', property: 'compliance', help: 'Précisez les licences, pays et restrictions réglementaires.' },
  { id: 'simulation', label: 'Simulation', help: 'Vérifiez la structure du modèle avant publication.' },
  { id: 'publication', label: 'Publication', help: 'Validez, publiez une version ou retirez l’activité du catalogue.' },
];

const defaults: Record<string, unknown> = {
  name: '',
  description: '',
  coverImageUrl: '',
  cities: [],
  questionnaire: [],
  roles: [],
  steps: [],
  pricing: { currency: 'XOF' },
  milestones: [],
  contract_template_id: null,
  compliance: {},
  cancellation_policy: {},
  matching_mode: 'AUTOMATIQUE',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function messageFor(error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return 'Connectez-vous avec un compte administrateur autorisé pour modifier le catalogue.';
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

export default function ActivityBuilderPage({ section }: { section: Section }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [document, setDocument] = useState<DraftDocument | null>(null);
  const [definition, setDefinition] = useState<Record<string, unknown>>(defaults);
  const [slug, setSlug] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [editor, setEditor] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createSectorId, setCreateSectorId] = useState('');
  const [createCountryCode, setCreateCountryCode] = useState('BJ');
  const [createSectors, setCreateSectors] = useState<SectorOption[]>([]);
  const [citiesEditor, setCitiesEditor] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<BuilderResult | null>(null);
  const [versions, setVersions] = useState<Record<string, unknown>[]>([]);

  const currentSection = sections.find((item) => item.id === section) ?? sections[0];
  const isNew = id === 'nouvelle';
  const sectionIndex = sections.findIndex((item) => item.id === section);

  const loadDocument = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      api<{ items: SectorOption[] }>('/sectors')
        .then((response) => setCreateSectors(response.items ?? []))
        .catch((sectorError: unknown) => setError(messageFor(sectorError)));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api<DraftDocument>(`/admin/activities/${encodeURIComponent(id)}/draft`);
      setDocument(data);
      setDefinition({ ...defaults, ...data.draft.definition });
      setSlug(data.activity.slug);
      setSectorId(data.activity.sectorId);
      setCountryCode(data.activity.countryCode ?? '');
      setCitiesEditor(JSON.stringify(data.draft.definition.cities ?? [], null, 2));
      const versionData = await api<{ items?: Record<string, unknown>[] }>(
        `/admin/activities/${encodeURIComponent(id)}/versions`,
      );
      setVersions(versionData.items ?? []);
    } catch (loadError) {
      setError(messageFor(loadError));
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { void loadDocument(); }, [loadDocument]);

  useEffect(() => {
    if (!currentSection.property) {
      setEditor('');
      return;
    }
    const value = definition[currentSection.property];
    setEditor(
      currentSection.property === 'contract_template_id'
        ? typeof value === 'string' ? value : ''
        : JSON.stringify(value ?? (['questionnaire', 'roles', 'steps', 'milestones'].includes(currentSection.property) ? [] : {}), null, 2),
    );
  }, [currentSection.property, definition]);

  const breadcrumbs = useMemo(() => document?.activity.slug ?? (isNew ? 'Nouvelle activité' : id), [document, id, isNew]);

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await api<{ id: string }>('/admin/activities', {
        method: 'POST',
        body: JSON.stringify({ slug: createSlug, sectorId: createSectorId, countryCode: createCountryCode || null }),
      });
      router.push(`/activites/${encodeURIComponent(created.id)}/informations`);
    } catch (createError) {
      setError(messageFor(createError));
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!document) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      let nextDefinition = definition;
      if (section === 'informations') {
        let cities: unknown;
        try {
          cities = JSON.parse(citiesEditor) as unknown;
        } catch {
          throw new Error('La liste des villes doit être un tableau JSON valide.');
        }
        if (!Array.isArray(cities)) throw new Error('La liste des villes doit être un tableau JSON.');
        nextDefinition = { ...definition, cities };
      }
      if (currentSection.property) {
        let value: unknown;
        if (currentSection.property === 'contract_template_id') {
          value = editor.trim() || null;
        } else {
          try {
            value = JSON.parse(editor) as unknown;
          } catch {
            throw new Error('Le contenu JSON est invalide. Corrigez-le avant d’enregistrer.');
          }
          if (currentSection.property === 'pricing' || currentSection.property === 'compliance') {
            if (!isRecord(value)) throw new Error('Cette section doit contenir un objet JSON.');
          } else if (!Array.isArray(value)) {
            throw new Error('Cette section doit contenir une liste JSON.');
          }
        }
        nextDefinition = { ...definition, [currentSection.property]: value };
      }
      setDefinition(nextDefinition);
      await api(`/admin/activities/${encodeURIComponent(id)}/draft`, {
        method: 'PUT',
        body: JSON.stringify({
          definition: nextDefinition,
          activity: { slug, sectorId, countryCode: countryCode || null },
        }),
      });
      setNotice('Brouillon enregistré.');
      await loadDocument();
    } catch (saveError) {
      setError(messageFor(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function validateDraft() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const validation = await api<BuilderResult>(`/admin/activities/${encodeURIComponent(id)}/validate`, { method: 'POST', body: '{}' });
      setResult(validation);
      if (validation.valid) setNotice('Le modèle est cohérent et prêt à être simulé ou publié.');
      else setError(validation.errors?.join(' ') || 'Le modèle contient des erreurs.');
    } catch (validationError) {
      setError(messageFor(validationError));
    } finally {
      setSaving(false);
    }
  }

  async function simulateDraft() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const simulation = await api<BuilderResult>(`/admin/activities/${encodeURIComponent(id)}/simulate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setResult(simulation);
      if (!simulation.valid) setError(simulation.errors?.join(' ') || 'Le modèle contient des erreurs.');
      else setNotice(simulation.note ?? 'Prévisualisation terminée.');
    } catch (simulationError) {
      setError(messageFor(simulationError));
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    if (!window.confirm('Publier cette version du modèle ? Elle sera visible dans le catalogue.')) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const published = await api<BuilderResult>(`/admin/activities/${encodeURIComponent(id)}/publish`, {
        method: 'POST',
        body: '{}',
      });
      setResult(published);
      setNotice(`Version ${published.publishedVersion} publiée. Le brouillon suivant est prêt à être modifié.`);
      await loadDocument();
    } catch (publishError) {
      setError(messageFor(publishError));
    } finally {
      setSaving(false);
    }
  }

  async function retireActivity() {
    if (!window.confirm('Retirer cette activité du catalogue ? Les projets en cours seront conservés.')) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api(`/admin/activities/${encodeURIComponent(id)}/retire`, { method: 'POST', body: '{}' });
      router.push('/activites');
    } catch (retireError) {
      setError(messageFor(retireError));
    } finally {
      setSaving(false);
    }
  }

  if (isNew) {
    return (
      <>
        <div className="page-heading"><div><p className="eyebrow">Activity Builder / Nouvelle activité</p><h1>Créer une activité</h1><p>Commencez par définir son identifiant et son secteur.</p></div></div>
        <form className="content-card" onSubmit={(event) => void createActivity(event)}>
          <div className="form-grid">
            <div className="form-field"><label className="field-label" htmlFor="create-slug">Identifiant (slug)</label><input id="create-slug" className="field-control" required value={createSlug} onChange={(event) => setCreateSlug(event.target.value)} placeholder="organisation-evenement" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></div>
            <div className="form-field"><label className="field-label" htmlFor="create-sector">Secteur</label>{createSectors.length ? <select id="create-sector" className="field-control" required value={createSectorId} onChange={(event) => setCreateSectorId(event.target.value)}><option value="">Choisir un secteur</option>{createSectors.map((sector) => <option value={sector.id} key={sector.id}>{isRecord(sector.nameI18n) && typeof sector.nameI18n.fr === 'string' ? sector.nameI18n.fr : sector.id}</option>)}</select> : <input id="create-sector" className="field-control" required value={createSectorId} onChange={(event) => setCreateSectorId(event.target.value)} placeholder="UUID du secteur" />}</div>
            <div className="form-field"><label className="field-label" htmlFor="create-country">Pays</label><input id="create-country" className="field-control" maxLength={2} value={createCountryCode} onChange={(event) => setCreateCountryCode(event.target.value.toUpperCase())} /></div>
          </div>
          <p className="help-text">Les identifiants de secteur sont disponibles dans le catalogue des secteurs.</p>
          {error && <div className="error-banner section-spacer" role="alert">{error}</div>}
          <div className="action-row"><button className="button-primary" type="submit" disabled={saving}>{saving ? 'Création…' : 'Créer le brouillon'}</button></div>
        </form>
      </>
    );
  }

  if (loading) return <div className="loading-state">Chargement du brouillon…</div>;
  if (error && !document) return <div className="error-banner" role="alert"><span aria-hidden="true">!</span><div><strong>Activity Builder indisponible</strong>{error}</div></div>;
  if (!document) return null;

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Activity Builder / {breadcrumbs}</p><h1>{currentSection.label}</h1><p>{currentSection.help}</p></div>
        <span className={`status-pill ${document.activity.status === 'PUBLIE' ? 'status-success' : 'status-warning'}`}>{document.activity.status.replaceAll('_', ' ')}</span>
      </div>

      <nav className="builder-steps" aria-label="Étapes de l’Activity Builder">
        {sections.map((item, index) => (
          <Link className={`builder-step ${item.id === section ? 'builder-step-active' : ''}`} href={`/activites/${encodeURIComponent(id)}/${item.id}`} key={item.id}>
            <span className="builder-step-number">{String(index + 1).padStart(2, '0')}</span>{item.label}
          </Link>
        ))}
      </nav>

      {error && <div className="error-banner section-spacer" role="alert"><span aria-hidden="true">!</span><div><strong>Action impossible</strong>{error}</div></div>}
      {notice && <div className="callout section-spacer" role="status">{notice}</div>}

      {section === 'informations' ? (
        <section className="content-card">
          <div className="form-grid">
            <div className="form-field"><label className="field-label" htmlFor="activity-name">Nom de l’activité</label><input id="activity-name" className="field-control" value={String(definition.name ?? '')} onChange={(event) => { setDefinition({ ...definition, name: event.target.value }); setResult(null); }} /></div>
            <div className="form-field"><label className="field-label" htmlFor="activity-slug">Identifiant (slug)</label><input id="activity-slug" className="field-control" value={slug} onChange={(event) => { setSlug(event.target.value); setResult(null); }} /></div>
            <div className="form-field"><label className="field-label" htmlFor="activity-sector">Identifiant du secteur</label><input id="activity-sector" className="field-control" value={sectorId} onChange={(event) => { setSectorId(event.target.value); setResult(null); }} /></div>
            <div className="form-field"><label className="field-label" htmlFor="activity-country">Pays</label><input id="activity-country" className="field-control" maxLength={2} value={countryCode} onChange={(event) => { setCountryCode(event.target.value.toUpperCase()); setResult(null); }} /></div>
            <div className="form-field form-field-wide"><label className="field-label" htmlFor="activity-description">Description</label><textarea id="activity-description" className="field-textarea" value={String(definition.description ?? '')} onChange={(event) => { setDefinition({ ...definition, description: event.target.value }); setResult(null); }} /></div>
            <div className="form-field form-field-wide"><label className="field-label" htmlFor="activity-cities">Villes proposées (JSON)</label><textarea id="activity-cities" className="field-textarea" value={citiesEditor} onChange={(event) => { setCitiesEditor(event.target.value); setResult(null); }} /></div>
          </div>
          <div className="action-row"><button className="button-primary" type="button" onClick={() => void saveDraft()} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le brouillon'}</button></div>
        </section>
      ) : null}

      {currentSection.property && section !== 'informations' ? (
        <section className="content-card">
          {section === 'contrat' ? (
            <div className="form-field"><label className="field-label" htmlFor="builder-contract">Identifiant du modèle de contrat</label><input id="builder-contract" className="field-control" value={editor} onChange={(event) => setEditor(event.target.value)} placeholder="Laisser vide si aucun modèle n’est associé" /></div>
          ) : (
            <div className="form-field"><label className="field-label" htmlFor="builder-json">{currentSection.label} — JSON</label><textarea id="builder-json" className="field-textarea" style={{ minHeight: 340, fontFamily: 'Consolas, monospace' }} spellCheck={false} value={editor} onChange={(event) => { setEditor(event.target.value); setResult(null); }} /></div>
          )}
          <p className="help-text">{currentSection.help}</p>
          <div className="action-row"><button className="button-primary" type="button" onClick={() => void saveDraft()} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer le brouillon'}</button></div>
        </section>
      ) : null}

      {section === 'simulation' ? (
        <section className="content-card">
          <div className="callout">Cette action vérifie la cohérence structurelle des sections. Le calcul d’un devis et la génération d’un planning simulé ne sont pas encore fournis par le moteur.</div>
          {result?.preview && <div className="metric-strip section-spacer">
            <span>{result.preview.questionnaireFieldCount} champs de questionnaire</span>
            <span>{result.preview.roleCount} rôles</span>
            <span>{result.preview.stepCount} étapes</span>
            <span>{result.preview.milestoneCount} jalons</span>
          </div>}
          <div className="action-row"><button className="button-secondary" type="button" onClick={() => void validateDraft()} disabled={saving}>Valider le modèle</button><button className="button-primary" type="button" onClick={() => void simulateDraft()} disabled={saving}>{saving ? 'Vérification…' : 'Lancer la prévisualisation'}</button></div>
        </section>
      ) : null}

      {section === 'publication' ? (
        <div className="dashboard-grid">
          <section className="content-card">
            <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>Contrôle avant publication</h2>
            <p className="muted-note">Une version publiée devient immuable. Les modifications suivantes seront enregistrées dans le brouillon de version suivante.</p>
            {result?.errors?.length ? <ul>{result.errors.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            <div className="action-row">
              <button className="button-secondary" type="button" onClick={() => void validateDraft()} disabled={saving}>Valider</button>
              <button className="button-primary" type="button" onClick={() => void publishDraft()} disabled={saving || !result?.valid}>Publier la version</button>
              {document.activity.status !== 'RETIRE' && <button className="button-secondary" type="button" onClick={() => void retireActivity()} disabled={saving}>Retirer du catalogue</button>}
            </div>
          </section>
          <section className="panel">
            <div className="panel-header"><div><h2>Historique des versions</h2><p>Versions du modèle d’activité</p></div></div>
            {versions.length ? <div className="table-wrap"><table className="admin-table"><thead><tr><th>Version</th><th>Statut</th><th>Publiée le</th></tr></thead><tbody>{versions.map((version) => <tr key={String(version.id)}><td>v{String(version.version)}</td><td><span className={`status-pill ${version.status === 'PUBLIE' ? 'status-success' : 'status-warning'}`}>{String(version.status)}</span></td><td>{version.publishedAt ? new Date(String(version.publishedAt)).toLocaleDateString('fr-FR') : '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state">Aucune version disponible.</div>}
          </section>
        </div>
      ) : null}

      <div className="action-row">
        {sectionIndex > 0 && <Link className="button-secondary" href={`/activites/${encodeURIComponent(id)}/${sections[sectionIndex - 1].id}`}>← Précédent</Link>}
        {sectionIndex < sections.length - 1 && <Link className="button-secondary" href={`/activites/${encodeURIComponent(id)}/${sections[sectionIndex + 1].id}`}>Suivant →</Link>}
      </div>
    </>
  );
}
