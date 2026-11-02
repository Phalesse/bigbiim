'use client';

import { useState } from 'react';
import { beginAdminLogin } from '@/lib/auth';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function signIn() {
    setLoading(true);
    setError('');
    try {
      const returnTo = new URLSearchParams(window.location.search).get('returnTo') ?? '/';
      await beginAdminLogin(returnTo);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'La connexion est indisponible.');
      setLoading(false);
    }
  }

  return (
    <div className="login-layout">
      <section className="login-card">
        <span className="brand-mark login-mark">B</span>
        <p className="eyebrow">Espace sécurisé</p>
        <h1>Connexion administrateur</h1>
        <p className="login-description">Connectez-vous via le fournisseur d’identité de BIGBIIM. L’accès est réservé aux comptes portant le rôle administrateur.</p>
        {error && <div className="error-banner section-spacer" role="alert"><span aria-hidden="true">!</span><div><strong>Connexion impossible</strong>{error}</div></div>}
        <button className="button-primary login-submit" type="button" onClick={() => void signIn()} disabled={loading}>
          {loading ? 'Redirection vers la connexion…' : 'Continuer avec mon compte'}
        </button>
        <p className="login-security">L’API vérifie la signature et les droits de chaque requête. Aucun secret client n’est stocké dans le navigateur.</p>
      </section>
    </div>
  );
}
