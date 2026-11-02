import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import type { Role } from './roles';

interface JsonWebKeySetEntry {
  kid?: unknown;
  kty?: unknown;
  alg?: unknown;
  use?: unknown;
  key_ops?: unknown;
  n?: unknown;
  e?: unknown;
}

interface TokenClaims {
  sub?: unknown;
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  realm_access?: { roles?: unknown };
}

export interface AuthenticatedPrincipal {
  id: string;
  roles: Role[];
}

const VALID_ROLES = new Set<Role>(['C', 'P', 'A', 'operator']);
const JWKS_CACHE_MS = 5 * 60 * 1000;
const MAX_TOKEN_LENGTH = 16_384;
const CLOCK_SKEW_SECONDS = 30;

@Injectable()
export class OidcTokenService {
  private cachedKeys: JsonWebKeySetEntry[] = [];
  private keysExpiresAt = 0;
  private lastUnknownKeyRefreshAt = 0;

  async authenticate(authorization: string | undefined): Promise<AuthenticatedPrincipal> {
    if (!authorization) throw new UnauthorizedException('Bearer token requis');
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(authorization);
    if (!match || match[1].length > MAX_TOKEN_LENGTH) {
      throw new UnauthorizedException('Bearer token invalide');
    }

    const [encodedHeader, encodedClaims, encodedSignature] = match[1].split('.');
    if (!encodedHeader || !encodedClaims || !encodedSignature) {
      throw new UnauthorizedException('Bearer token invalide');
    }

    const header = this.decodeJsonSegment(encodedHeader) as Record<string, unknown>;
    const claims = this.decodeJsonSegment(encodedClaims) as TokenClaims;
    if (
      header.alg !== 'RS256' ||
      typeof header.kid !== 'string' ||
      header.kid.length === 0 ||
      header.crit !== undefined ||
      header.b64 === false
    ) {
      throw new UnauthorizedException('Algorithme ou clé du jeton invalide');
    }

    const key = await this.findKey(header.kid);
    let publicKey;
    try {
      publicKey = createPublicKey({
        key: { kty: 'RSA', n: key.n as string, e: key.e as string },
        format: 'jwk',
      });
    } catch {
      throw new ServiceUnavailableException('Clé OIDC invalide');
    }
    if (
      publicKey.asymmetricKeyType !== 'rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    ) {
      throw new ServiceUnavailableException('Clé OIDC insuffisamment robuste');
    }

    const signedContent = `${encodedHeader}.${encodedClaims}`;
    const signature = this.decodeBase64Url(encodedSignature);
    if (!verifySignature('RSA-SHA256', Buffer.from(signedContent), publicKey, signature)) {
      throw new UnauthorizedException('Signature du jeton invalide');
    }

    this.validateClaims(claims);
    const realmRoles = claims.realm_access?.roles;
    if (realmRoles !== undefined && !Array.isArray(realmRoles)) {
      throw new UnauthorizedException('Rôles du jeton invalides');
    }

    return {
      id: claims.sub as string,
      roles: (realmRoles ?? []).filter(
        (role): role is Role => typeof role === 'string' && VALID_ROLES.has(role as Role),
      ),
    };
  }

  private decodeJsonSegment(segment: string): Record<string, unknown> {
    try {
      const value: unknown = JSON.parse(this.decodeBase64Url(segment).toString('utf8'));
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new UnauthorizedException('Contenu du jeton invalide');
      }
      return value as Record<string, unknown>;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Contenu du jeton invalide');
    }
  }

  private decodeBase64Url(segment: string): Buffer {
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
      throw new UnauthorizedException('Encodage du jeton invalide');
    }
    return Buffer.from(segment, 'base64url');
  }

  private async findKey(kid: string): Promise<JsonWebKeySetEntry> {
    let keys = this.cachedKeys;
    let refreshed = false;
    if (Date.now() >= this.keysExpiresAt || keys.length === 0) {
      keys = await this.fetchKeys();
      refreshed = true;
    }

    let key = keys.find((candidate) => candidate.kid === kid);
    if (!key && !refreshed && Date.now() - this.lastUnknownKeyRefreshAt >= 30_000) {
      this.lastUnknownKeyRefreshAt = Date.now();
      keys = await this.fetchKeys();
      key = keys.find((candidate) => candidate.kid === kid);
    }
    if (!key) throw new UnauthorizedException('Clé de signature inconnue');
    if (
      key.kty !== 'RSA' ||
      typeof key.n !== 'string' ||
      typeof key.e !== 'string' ||
      (key.alg !== undefined && key.alg !== 'RS256') ||
      (key.use !== undefined && key.use !== 'sig') ||
      (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify')))
    ) {
      throw new ServiceUnavailableException('Clé de signature OIDC invalide');
    }
    return key;
  }

  private async fetchKeys(): Promise<JsonWebKeySetEntry[]> {
    const jwksUrl = process.env.OIDC_JWKS_URL;
    if (!jwksUrl) throw new ServiceUnavailableException('OIDC_JWKS_URL non configuré');

    let url: URL;
    try {
      url = new URL(jwksUrl);
    } catch {
      throw new ServiceUnavailableException('OIDC_JWKS_URL invalide');
    }
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && process.env.NODE_ENV === 'development')
    ) {
      throw new ServiceUnavailableException('Protocole OIDC_JWKS_URL invalide');
    }

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'error' });
    } catch {
      throw new ServiceUnavailableException('Fournisseur OIDC indisponible');
    }
    if (!response.ok) throw new ServiceUnavailableException('Fournisseur OIDC indisponible');
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 262_144) {
      throw new ServiceUnavailableException('Réponse JWKS trop volumineuse');
    }

    let responseBody: string;
    try {
      responseBody = await response.text();
    } catch {
      throw new ServiceUnavailableException('Réponse JWKS invalide');
    }
    if (responseBody.length > 262_144) {
      throw new ServiceUnavailableException('Réponse JWKS trop volumineuse');
    }
    let body: unknown;
    try {
      body = JSON.parse(responseBody);
    } catch {
      throw new ServiceUnavailableException('Réponse JWKS invalide');
    }
    if (
      typeof body !== 'object' ||
      body === null ||
      !('keys' in body) ||
      !Array.isArray(body.keys) ||
      body.keys.length === 0 ||
      body.keys.length > 100 ||
      body.keys.some((key) => typeof key !== 'object' || key === null || Array.isArray(key))
    ) {
      throw new ServiceUnavailableException('Réponse JWKS invalide');
    }

    this.cachedKeys = body.keys as JsonWebKeySetEntry[];
    this.keysExpiresAt = Date.now() + JWKS_CACHE_MS;
    return this.cachedKeys;
  }

  private validateClaims(claims: TokenClaims): void {
    const issuer = process.env.OIDC_ISSUER_URL;
    const audience = process.env.OIDC_AUDIENCE;
    if (!issuer || !audience) {
      throw new ServiceUnavailableException('OIDC_ISSUER_URL et OIDC_AUDIENCE non configurés');
    }
    let issuerUrl: URL;
    try {
      issuerUrl = new URL(issuer);
    } catch {
      throw new ServiceUnavailableException('OIDC_ISSUER_URL invalide');
    }
    if (
      (issuerUrl.protocol !== 'https:' &&
        !(issuerUrl.protocol === 'http:' && process.env.NODE_ENV === 'development')) ||
      issuerUrl.username !== '' ||
      issuerUrl.password !== '' ||
      issuerUrl.search !== '' ||
      issuerUrl.hash !== ''
    ) {
      throw new ServiceUnavailableException('OIDC_ISSUER_URL invalide');
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new UnauthorizedException('Sujet du jeton manquant');
    }
    if (claims.iss !== issuer) throw new UnauthorizedException('Émetteur du jeton invalide');
    const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
    if (!Array.isArray(audiences) || !audiences.includes(audience)) {
      throw new UnauthorizedException('Audience du jeton invalide');
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp <= now - CLOCK_SKEW_SECONDS) {
      throw new UnauthorizedException('Jeton expiré ou sans date d’expiration');
    }
    if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now + CLOCK_SKEW_SECONDS)) {
      throw new UnauthorizedException('Jeton pas encore valide');
    }
  }
}
