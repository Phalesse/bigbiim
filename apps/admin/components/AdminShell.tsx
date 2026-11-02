'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminLoginPath, clearAdminSession, getAdminIdentity } from '@/lib/auth';

const navigation = [
  {
    label: 'Vue d’ensemble',
    items: [{ label: 'Tableau de bord', href: '/', icon: '⌂' }],
  },
  {
    label: 'Opérations',
    items: [
      { label: 'Projets', href: '/projets', icon: '▦' },
      { label: 'Prestataires', href: '/prestataires', icon: '♙' },
      { label: 'Litiges', href: '/litiges', icon: '◇' },
      { label: 'Paiements', href: '/paiements', icon: '◉' },
      { label: 'Utilisateurs', href: '/utilisateurs', icon: '♧' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { label: 'Activités', href: '/activites', icon: '✳' },
      { label: 'Compétences', href: '/competences', icon: '⌘' },
      { label: 'Secteurs', href: '/secteurs', icon: '▤' },
      { label: 'Modèles', href: '/modeles', icon: '▧' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Rapports', href: '/rapports', icon: '▥' },
      { label: 'Journal d’audit', href: '/audit', icon: '≋' },
      { label: 'Paramètres', href: '/parametres', icon: '⚙' },
    ],
  },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const isPublicAuthRoute = pathname === '/connexion' || pathname === '/auth/callback';

  useEffect(() => {
    const identity = getAdminIdentity();
    if (isPublicAuthRoute) {
      if (identity && pathname === '/connexion') router.replace('/');
      setAuthReady(true);
      return;
    }
    if (!identity) {
      router.replace(adminLoginPath(pathname || '/'));
      return;
    }
    setAuthReady(true);
  }, [isPublicAuthRoute, pathname, router]);

  function signOut() {
    clearAdminSession();
    router.replace('/connexion');
  }

  if (!authReady && !isPublicAuthRoute) {
    return <div className="auth-loading">Vérification de la session administrateur…</div>;
  }

  return (
    <div className="admin-frame">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />}
      <aside className={`admin-sidebar ${menuOpen ? 'admin-sidebar-open' : ''}`}>
        <Link className="brand-lockup" href="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">B</span>
          <span>
            <strong>BIGBIIM</strong>
            <small>ESPACE ADMIN</small>
          </span>
        </Link>

        <div className="workspace-switcher">
          <span className="workspace-avatar">B</span>
          <span className="workspace-copy">
            <strong>BIGBIIM</strong>
            <small>Plateforme</small>
          </span>
          <span className="workspace-chevron">⌄</span>
        </div>

        <nav className="admin-nav" aria-label="Navigation principale">
          {navigation.map((group) => (
            <section className="nav-group" key={group.label}>
              <p className="nav-heading">{group.label}</p>
              {group.items.map((item) => {
                const active =
                  item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    className={`nav-link ${active ? 'nav-link-active' : ''}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.href === '/litiges' && <span className="nav-dot" aria-label="Nouveaux éléments" />}
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">Espace réservé aux administrateurs</div>
          <div className="sidebar-user">
            <span className="user-avatar">A</span>
            <span className="user-copy"><strong>Administrateur</strong><small>Rôle A</small></span>
            <span className="workspace-chevron">···</span>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button className="mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
            <span />
            <span />
            <span />
          </button>
          <div className="breadcrumbs"><span>BIGBIIM</span><span className="breadcrumb-separator">/</span><strong>Administration</strong></div>
          <div className="topbar-actions">
            {!isPublicAuthRoute && <button className="signout-button" type="button" onClick={signOut}>Déconnexion</button>}
            {!isPublicAuthRoute && <span className="topbar-avatar" aria-label="Compte administrateur">A</span>}
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
