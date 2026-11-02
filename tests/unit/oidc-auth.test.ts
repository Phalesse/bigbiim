import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { OidcTokenService } from '../../apps/api/src/common/oidc-token.service';

const issuer = 'https://issuer.example/realms/bigbiim';
const audience = 'bigbiim-api';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
let server: Server | undefined;
let tokenService: OidcTokenService;
let previousEnvironment: Record<string, string | undefined> = {};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createToken(claimOverrides: Record<string, unknown> = {}, privateKeyOverride = privateKey) {
  const header = encode({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
  const claims = encode({
    sub: 'user-123',
    iss: issuer,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 300,
    realm_access: { roles: ['C', 'unknown'] },
    ...claimOverrides,
  });
  const signingInput = `${header}.${claims}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKeyOverride).toString(
    'base64url',
  );
  return `${signingInput}.${signature}`;
}

describe('OIDC token verification', () => {
  beforeAll(async () => {
    previousEnvironment = {
      OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL,
      OIDC_AUDIENCE: process.env.OIDC_AUDIENCE,
      OIDC_JWKS_URL: process.env.OIDC_JWKS_URL,
      NODE_ENV: process.env.NODE_ENV,
    };
    server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', use: 'sig', alg: 'RS256' }] }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('JWKS test server failed to start');

    process.env.OIDC_ISSUER_URL = issuer;
    process.env.OIDC_AUDIENCE = audience;
    process.env.OIDC_JWKS_URL = `http://127.0.0.1:${address.port}/jwks`;
    process.env.NODE_ENV = 'development';
    tokenService = new OidcTokenService();
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('verifies a signed token and returns only supported realm roles', async () => {
    await expect(tokenService.authenticate(`Bearer ${createToken()}`)).resolves.toEqual({
      id: 'user-123',
      roles: ['C'],
    });
  });

  it('rejects missing, invalid and expired bearer tokens', async () => {
    await expect(tokenService.authenticate(undefined)).rejects.toMatchObject({ status: 401 });
    await expect(tokenService.authenticate('Basic abc')).rejects.toMatchObject({ status: 401 });
    await expect(
      tokenService.authenticate(`Bearer ${createToken({ exp: 1 })}`),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects invalid signatures, issuer and audience', async () => {
    const otherPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await expect(
      tokenService.authenticate(`Bearer ${createToken({}, otherPair.privateKey)}`),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      tokenService.authenticate(`Bearer ${createToken({ iss: 'https://wrong.example' })}`),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      tokenService.authenticate(`Bearer ${createToken({ aud: 'wrong-audience' })}`),
    ).rejects.toMatchObject({ status: 401 });
  });
});
