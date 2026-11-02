'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';

type TaxonomyItem = {
  id: string;
  nameI18n?: unknown;
  parentId?: string | null;
  sectorId?: string | null;
  icon?: string | null;
  synonyms?: string[];
  regulated?: boolean;
  requiredLicenseType?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function frenchName(item: TaxonomyItem) {
  return isRecord(item.nameI18n) && typeof item.nameI18n.fr === 'string' ? item.nameI18n.fr : '—';
}

function errorText(error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return 'Connectez-vous avec un compte administrateur autorisé pour gérer le catalogue.';
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

export default function TaxonomyAdminPage({ kind }: { kind: 'sectors' | 'skills' }) {
  const isSector = kind === 'sectors';
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [parentId, setParentId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [synonyms, setSynonyms] = useState('');
  const [regulated, setRegulated] = useState(false);
  const [licenseType, setLicenseType] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api<{ items: TaxonomyItem[] }>(isSector ? '/sectors' : '/skills');
      setItems(response.items ?? []);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [isSector]);

  useEffect(() => { void load(); }, [load]);

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body = isSector
        ? { nameI18n: { fr: name.trim() }, parentId: parentId || null, icon: icon.trim() || null }
        : {
            nameI18n: { fr: name.trim() },
            sectorId: sectorId || null,
            synonyms: synonyms.split(',').map((item) => item.trim()).filter(Boolean),
            regulated,
            requiredLicenseType: licenseType.trim() || null,
          };
      await api(`/admin/${kind}`, { method: 'POST', body: JSON.stringify(body) });
      setName('');
      setIcon('');
      setParentId('');
      setSectorId('');
      setSynonyms('');
      setRegulated(false);
      setLicenseType('');
      setNotice(isSector ? 'Secteur créé.' : 'Compétence créée.');
      await load();
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Catalogue</p><h1>{isSector ? 'Secteurs et taxonomie' : 'Catalogue de compétences'}</h1><p>{isSector ? 'Créez et consultez les secteurs qui structurent les activités.' : 'Ajoutez des compétences au catalogue et indiquez leurs exigences réglementaires.'}</p></div>
      </div>
      {error && <div className="error-banner section-spacer" role="alert"><span aria-hidden="true">!</span><div><strong>Opération impossible</strong>{error}</div></div>}
      {notice && <div className="callout section-spacer" role="status">{notice}</div>}
      <section className="content-card">
        <h2 style={{ margin: '0 0 15px', fontSize: 15 }}>{isSector ? 'Créer un secteur' : 'Créer une compétence'}</h2>
        <form onSubmit={(event) => void createItem(event)}>
          <div className="form-grid">
            <div className="form-field"><label className="field-label" htmlFor="taxonomy-name">Nom en français</label><input id="taxonomy-name" className="field-control" required value={name} onChange={(event) => setName(event.target.value)} /></div>
            {isSector ? (
              <>
                <div className="form-field"><label className="field-label" htmlFor="taxonomy-icon">Icône (facultatif)</label><input id="taxonomy-icon" className="field-control" value={icon} onChange={(event) => setIcon(event.target.value)} /></div>
                <div className="form-field"><label className="field-label" htmlFor="taxonomy-parent">ID du secteur parent (facultatif)</label><input id="taxonomy-parent" className="field-control" value={parentId} onChange={(event) => setParentId(event.target.value)} /></div>
              </>
            ) : (
              <>
                <div className="form-field"><label className="field-label" htmlFor="taxonomy-sector">ID du secteur (facultatif)</label><input id="taxonomy-sector" className="field-control" value={sectorId} onChange={(event) => setSectorId(event.target.value)} /></div>
                <div className="form-field"><label className="field-label" htmlFor="taxonomy-synonyms">Synonymes (séparés par des virgules)</label><input id="taxonomy-synonyms" className="field-control" value={synonyms} onChange={(event) => setSynonyms(event.target.value)} /></div>
                <div className="form-field"><label className="field-label" htmlFor="taxonomy-license">Type de licence requis</label><input id="taxonomy-license" className="field-control" value={licenseType} onChange={(event) => setLicenseType(event.target.value)} disabled={!regulated} /></div>
                <label className="form-field checkbox-field"><input type="checkbox" checked={regulated} onChange={(event) => setRegulated(event.target.checked)} /> Compétence réglementée</label>
              </>
            )}
          </div>
          <div className="action-row"><button className="button-primary" type="submit" disabled={saving}>{saving ? 'Création…' : isSector ? 'Créer le secteur' : 'Créer la compétence'}</button></div>
        </form>
      </section>
      <section className="panel section-spacer">
        <div className="panel-header"><div><h2>{isSector ? 'Secteurs enregistrés' : 'Compétences enregistrées'}</h2><p>{items.length} élément{items.length === 1 ? '' : 's'} dans le catalogue</p></div><button className="button-secondary" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Actualisation…' : '↻ Actualiser'}</button></div>
        {loading && items.length === 0 ? <div className="loading-state">Chargement du catalogue…</div> : null}
        {!loading && items.length === 0 && !error ? <div className="empty-state">Aucun élément enregistré.</div> : null}
        {items.length > 0 && <div className="table-wrap"><table className="admin-table"><thead><tr><th>Nom</th><th>ID</th>{isSector ? <><th>Parent</th><th>Icône</th></> : <><th>Secteur</th><th>Synonymes</th><th>Réglementée</th><th>Licence</th></>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="table-primary">{frenchName(item)}</td><td>{item.id}</td>{isSector ? <><td>{item.parentId ?? '—'}</td><td>{item.icon ?? '—'}</td></> : <><td>{item.sectorId ?? '—'}</td><td>{item.synonyms?.join(', ') || '—'}</td><td>{item.regulated ? 'Oui' : 'Non'}</td><td>{item.requiredLicenseType ?? '—'}</td></>}</tr>)}</tbody></table></div>}
      </section>
    </>
  );
}
