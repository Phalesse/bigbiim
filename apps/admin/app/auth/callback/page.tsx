'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearAdminSession, completeAdminLogin } from '@/lib/auth';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    completeAdminLogin(window.location.search)
      .then((returnTo) => {
        if (active) router.replace(returnTo);
      })
      .catch((loginError: unknown) => {
        clearAdminSession();
        if (active) setError(loginError instanceof Error ? loginError.message : 'La connexion a échoué.');
      });
    return () => { active = false; };
  }, [router]);

  return (
    <div className="login-layout">
      <section className="login-card">
        <span className="brand-mark login-mark">B</span>
        <p className="eyebrow">Espace sécurisé</p>
        <h1>{error ? 'Connexion refusée' : 'Vérification en cours'}</h1>
        {error ? (
          <>
            <div className="error-banner section-spacer" role="alert"><span aria-hidden="true">!</span><div><strong>Impossible d’ouvrir la session</strong>{error}</div></div>
            <a className="button-primary login-submit" href="/connexion">Retour à la connexion</a>
          </>
        ) : <p className="login-description">Nous vérifions la réponse du fournisseur d’identité. Cette page ne conserve pas le code d’autorisation.</p>}
      </section>
    </div>
  );
}
