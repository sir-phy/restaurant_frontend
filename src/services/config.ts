// ── restaurant_backend connection settings ──────────────────────────────
// The Vue frontend talks directly to the restaurant_backend REST and
// Socket.IO servers (full-integration — the in-memory mock server is bypassed).
//
// Override at build/runtime by setting VITE_API_BASE_URL / VITE_SOCKET_URL.
const envAccess: any = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;

const DEFAULT_BACKEND_URL = 'http://localhost:4000';

export const API_BASE_URL: string = envAccess?.VITE_API_BASE_URL || DEFAULT_BACKEND_URL;
export const SOCKET_URL: string = envAccess?.VITE_SOCKET_URL || API_BASE_URL;