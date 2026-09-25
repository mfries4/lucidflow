import type { Diagram, DocumentFull, DocumentKind, DocumentSummary, Folder } from '../types';

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

interface DocumentPatch {
  name?: string;
  data?: Diagram;
  preview?: string | null;
  folderId?: string | null;
  pinned?: boolean;
}

export const api = {
  list: (options: { trash?: boolean } = {}) =>
    request<DocumentSummary[]>(`/documents${options.trash ? '?trash=1' : ''}`),
  get: (id: string) => request<DocumentFull>(`/documents/${id}`),
  create: (payload: { name: string; kind: DocumentKind; data: Diagram }) =>
    request<DocumentFull>('/documents', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, patch: DocumentPatch) =>
    request<DocumentFull>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** Suppression ordinaire : le document part à la corbeille, il reste récupérable. */
  trash: (id: string) => request<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' }),
  restore: (id: string) => request<DocumentFull>(`/documents/${id}/restore`, { method: 'POST' }),
  purge: (id: string) => request<{ ok: boolean }>(`/documents/${id}?purge=1`, { method: 'DELETE' }),
  emptyTrash: () => request<{ removed: number }>('/trash', { method: 'DELETE' }),
  duplicate: (id: string) => request<DocumentFull>(`/documents/${id}/duplicate`, { method: 'POST' }),

  folders: {
    list: () => request<Folder[]>('/folders'),
    create: (name: string) =>
      request<Folder>('/folders', { method: 'POST', body: JSON.stringify({ name }) }),
    rename: (id: string, name: string) =>
      request<Folder>(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    remove: (id: string) => request<{ ok: boolean }>(`/folders/${id}`, { method: 'DELETE' }),
  },
};
