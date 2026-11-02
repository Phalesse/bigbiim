'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

type SettingItem = { key: string; scope: string; value: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return 'Connectez-vous avec un compte administrateur autorisé pour modifier les paramètres.';
  }
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

export default function SettingsAdminPage() {
  const [editor, setEditor] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api<{ items: SettingItem[] }>('/admin/settings');
      setEditor(JSON.stringify(response.items ?? [], null, 2));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const parsed: unknown = JSON.parse(editor);
      if (!Array.isArray(parsed)) {
        throw new Error('Le document doit être une liste d’objets avec les champs key et value.');
      }
      const items: SettingItem[] = parsed.map((item, index) => {
        if (!isRecord(item) || typeof item.key !== 'string' || item.value === undefined) {
          throw new Error(`L’élément ${index + 1} doit contenir les champs key et value.`);
        }
        return {
          key: item.key,
          scope: typeof item.scope === 'string' ? item.scope : 'global',
          value: item.value,
        };
      });
      if (items.length === 0) throw new Error('La liste ne peut pas être vide.');
      await api('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      });
      setNotice('Paramètres enregistrés. Chaque modification a été ajoutée au journal d’audit.');
      await load();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Configuration</p><h1>Paramètres de la plateforme</h1><p>Modifiez les paramètres conservés par l’API sans imposer de valeurs métier par défaut.</p></div>
      </div>
      {error && <div className="error-banner section-spacer" role="alert"><span aria-hidden="true">!</span><div><strong>Opération impossible</strong>{error}</div></div>}
      {notice && <div className="callout section-spacer" role="status">{notice}</div>}
      <section className="content-card section-spacer">
        <div className="form-field">
          <label className="field-label" htmlFor="settings-json">Paramètres JSON</label>
          <textarea
            id="settings-json"
            className="field-textarea"
            style={{ minHeight: 420, fontFamily: 'Consolas, monospace' }}
            spellCheck={false}
            value={editor}
            onChange={(event) => setEditor(event.target.value)}
            disabled={loading}
            placeholder={'[\n  { "key": "commission.rate", "scope": "global", "value": 0 }\n]'}
          />
          <p className="help-text">Format attendu : une liste d’objets avec <code>key</code>, <code>scope</code> (facultatif) et <code>value</code>. Enregistrer met à jour ou crée les paramètres listés, sans supprimer les autres.</p>
        </div>
        <div className="action-row">
          <button className="button-secondary" type="button" onClick={() => void load()} disabled={loading || saving}>↻ Recharger</button>
          <button className="button-primary" type="button" onClick={() => void save()} disabled={loading || saving}>{saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button>
        </div>
      </section>
    </>
  );
}
