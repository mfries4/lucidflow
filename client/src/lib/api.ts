import type { Diagram, DocumentFull, DocumentKind, DocumentSummary } from '../types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `Erreur ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  list: () => request<DocumentSummary[]>('/documents'),
  get: (id: string) => request<DocumentFull>(`/documents/${id}`),
  create: (payload: { name: string; kind: DocumentKind; data: Diagram }) =>
    request<DocumentFull>('/documents', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, patch: { name?: string; data?: Diagram; preview?: string | null }) =>
    request<DocumentFull>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => request<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' }),
  duplicate: (id: string) => request<DocumentFull>(`/documents/${id}/duplicate`, { method: 'POST' }),
};
