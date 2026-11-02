/** Client HTTP vers l'API (/api/v1). */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window === 'undefined' ? null : window.localStorage.getItem('bigbiim.accessToken');
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body) headers.set('Content-Type', 'application/json');
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!res.ok) {
    const problem = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const detail = problem.detail ?? problem.message ?? problem.title;
    throw new Error(typeof detail === 'string' ? detail : `La requête a échoué (HTTP ${res.status}).`);
  }
  return payload as T;
}
