const TOKEN_KEY = 'bigbiim.admin.access_token';
const EXPIRES_KEY = 'bigbiim.admin.expires_at';
const STATE_KEY = 'bigbiim.admin.oidc_state';
const VERIFIER_KEY = 'bigbiim.admin.pkce_verifier';
const RETURN_TO_KEY = 'bigbiim.admin.return_to';

export type AdminIdentity = { subject: string; expiresAt: number };

function oidcConfig() {
  const issuer = process.env.NEXT_PUBLIC_OIDC_ISSUER_URL?.replace(/\/+$/, '');
  const clientId = process.env.NEXT_PUBLIC_OIDC_CLIENT_ID;
  if (!issuer || !clientId) {
    throw new Error('OIDC admin non configuré. Renseignez NEXT_PUBLIC_OIDC_ISSUER_URL et NEXT_PUBLIC_OIDC_CLIENT_ID.');
  }
  return { issuer, clientId };
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeClaims(token: string) {
  const encoded = token.split('.')[1];
  if (!encoded) throw new Error('Jeton invalide.');
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return JSON.parse(decoded) as {
    sub?: unknown;
    exp?: unknown;
    realm_access?: { roles?: unknown };
  };
}

function randomString(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return base64Url(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function redirectUri() {
  const configured = process.env.NEXT_PUBLIC_OIDC_REDIRECT_URI;
  return configured || `${window.location.origin}/admin/auth/callback`;
}

export function getAdminIdentity(): AdminIdentity | null {
  if (typeof window === 'undefined') return null;
  const token = sessionStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(sessionStorage.getItem(EXPIRES_KEY));
  if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 15_000) {
    clearAdminSession();
    return null;
  }
  try {
    const claims = decodeClaims(token);
    if (typeof claims.sub !== 'string' || !Array.isArray(claims.realm_access?.roles) ||
      !claims.realm_access.roles.includes('A') ||
      typeof claims.exp !== 'number' ||
      claims.exp * 1000 <= Date.now() + 15_000) {
      clearAdminSession();
      return null;
    }
    return { subject: claims.sub, expiresAt };
  } catch {
    clearAdminSession();
    return null;
  }
}

export function getAccessToken() {
  if (typeof window === 'undefined') return undefined;
  return getAdminIdentity() ? sessionStorage.getItem(TOKEN_KEY) ?? undefined : undefined;
}

export function clearAdminSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EXPIRES_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
}

export async function beginAdminLogin(returnTo: string) {
  const { issuer, clientId } = oidcConfig();
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Impossible de charger la configuration OIDC (HTTP ${response.status}).`);
  const metadata = await response.json() as { issuer?: unknown; authorization_endpoint?: unknown };
  if (metadata.issuer !== issuer || typeof metadata.authorization_endpoint !== 'string') {
    throw new Error('La configuration OIDC ne correspond pas à l’émetteur configuré.');
  }

  const state = randomString();
  const verifier = randomString(48);
  const challenge = await sha256(verifier);
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.startsWith('/admin/auth/')
    ? returnTo
    : '/';

  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(RETURN_TO_KEY, safeReturnTo);
  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid profile email',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  window.location.assign(authorizationUrl.toString());
}

export async function completeAdminLogin(search: string) {
  const { issuer, clientId } = oidcConfig();
  const params = new URLSearchParams(search);
  const providerError = params.get('error');
  if (providerError) {
    const detail = params.get('error_description');
    throw new Error(detail ? `${providerError} : ${detail}` : `Connexion OIDC refusée : ${providerError}.`);
  }

  const code = params.get('code');
  const state = params.get('state');
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    throw new Error('Réponse OIDC invalide ou expirée. Relancez la connexion.');
  }

  const discoveryResponse = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!discoveryResponse.ok) throw new Error(`Impossible de charger la configuration OIDC (HTTP ${discoveryResponse.status}).`);
  const metadata = await discoveryResponse.json() as { issuer?: unknown; token_endpoint?: unknown };
  if (metadata.issuer !== issuer || typeof metadata.token_endpoint !== 'string') {
    throw new Error('La configuration OIDC ne correspond pas à l’émetteur configuré.');
  }

  const tokenResponse = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri(),
      code,
      code_verifier: verifier,
    }),
    cache: 'no-store',
  });
  const tokenPayload = await tokenResponse.json() as {
    access_token?: unknown;
    expires_in?: unknown;
    error_description?: unknown;
    error?: unknown;
  };
  if (!tokenResponse.ok || typeof tokenPayload.access_token !== 'string') {
    const message = typeof tokenPayload.error_description === 'string'
      ? tokenPayload.error_description
      : typeof tokenPayload.error === 'string'
        ? tokenPayload.error
        : `Échange du code OIDC refusé (HTTP ${tokenResponse.status}).`;
    throw new Error(message);
  }

  const expiresIn = typeof tokenPayload.expires_in === 'number' && tokenPayload.expires_in > 0
    ? tokenPayload.expires_in
    : 300;
  sessionStorage.setItem(TOKEN_KEY, tokenPayload.access_token);
  sessionStorage.setItem(EXPIRES_KEY, String(Date.now() + expiresIn * 1000));
  const identity = getAdminIdentity();
  if (!identity) {
    clearAdminSession();
    throw new Error('Ce compte ne possède pas le rôle administrateur A.');
  }

  const returnTo = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  return returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
}

export function apiAuthorizationHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function adminLoginPath(returnTo = '/') {
  const encoded = encodeURIComponent(returnTo);
  return `/connexion?returnTo=${encoded}`;
}
