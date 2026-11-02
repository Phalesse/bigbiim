import { apiAuthorizationHeaders } from '@/lib/auth';

/** Client HTTP vers l'API (/api/v1). */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(apiAuthorizationHeaders())) headers.set(name, value);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const responseText = await res.text();
  let payload: unknown;

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = responseText;
    }
  }

  if (!res.ok) {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    const message = typeof body?.detail === 'string'
      ? body.detail
      : typeof body?.message === 'string'
        ? body.message
        : typeof payload === 'string' && payload.length > 0
          ? payload
          : `La requête a échoué (HTTP ${res.status}).`;
    throw new ApiError(message, res.status);
  }

  if (res.status === 204 || !responseText) return undefined as T;
  return payload as T;
}
