'use client';

import { EDIT_TOKEN_HEADER } from '@/lib/api/edit-token';
import { ERROR_MESSAGES, isErrorCode, type ErrorCode } from '@/lib/errors';
import type { CreatePasteResult, PastePayload, PasteMetadata, PasteContent } from '@/types/paste';

/** Error carrying the server's stable code, so the UI can branch on it. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: string[];

  constructor(code: ErrorCode, message: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('INTERNAL_ERROR', 'Network error. Check your connection and try again.');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string; details?: string[] } } | null;
    const code = isErrorCode(body?.error?.code) ? body.error.code : 'INTERNAL_ERROR';
    throw new ApiError(code, body?.error?.message ?? ERROR_MESSAGES[code], body?.error?.details ?? []);
  }

  return payload as T;
}

export type CreatePasteBody = {
  title: string | null;
  language: string;
  expiration: string;
  burnAfterRead: boolean;
} & (
  | { isEncrypted: false; content: string; password: string | null }
  | { isEncrypted: true; encryptedContent: string; encryptionIv: string; encryptionVersion: number }
);

export function createPaste(body: CreatePasteBody): Promise<CreatePasteResult> {
  return request<CreatePasteResult>('/api/pastes', { method: 'POST', body: JSON.stringify(body) });
}

export function fetchPaste(slug: string, countView = false): Promise<PastePayload> {
  return request<PastePayload>(`/api/pastes/${encodeURIComponent(slug)}${countView ? '?count=1' : ''}`);
}

export function unlockPaste(slug: string, password: string): Promise<PastePayload> {
  return request<PastePayload>(`/api/pastes/${encodeURIComponent(slug)}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function revealPaste(slug: string): Promise<PastePayload> {
  return request<PastePayload>(`/api/pastes/${encodeURIComponent(slug)}/reveal`, { method: 'POST' });
}

export function loadPasteForEdit(
  slug: string,
  editToken: string,
): Promise<{ meta: PasteMetadata; body: PasteContent }> {
  return request(`/api/pastes/${encodeURIComponent(slug)}?edit=1`, {
    headers: { [EDIT_TOKEN_HEADER]: editToken },
  });
}

export type UpdatePasteBody = {
  title: string | null;
  language: string;
  expiration: string;
} & (
  | { isEncrypted: false; content: string }
  | { isEncrypted: true; encryptedContent: string; encryptionIv: string; encryptionVersion: number }
);

export function updatePaste(
  slug: string,
  editToken: string,
  body: UpdatePasteBody,
): Promise<{ meta: PasteMetadata }> {
  return request(`/api/pastes/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { [EDIT_TOKEN_HEADER]: editToken },
    body: JSON.stringify(body),
  });
}

export function deletePaste(slug: string, editToken: string): Promise<{ deleted: boolean }> {
  return request(`/api/pastes/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: { [EDIT_TOKEN_HEADER]: editToken },
  });
}
