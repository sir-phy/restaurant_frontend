/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the restaurant_backend REST + Socket.IO server. */
  readonly VITE_API_BASE_URL: string
  /** Socket.IO endpoint. Falls back to VITE_API_BASE_URL when unset. */
  readonly VITE_SOCKET_URL?: string

  // Bakong / KHQR merchant configuration (mirrors restaurant_backend/.env).
  // These values are embedded into the payment QR, so they are not secret.
  readonly VITE_BAKONG_ACCOUNT_ID: string
  readonly VITE_BAKONG_ACCOUNT_NAME?: string
  readonly VITE_BAKONG_MERCHANT_NAME: string
  readonly VITE_BAKONG_MERCHANT_ID: string
  readonly VITE_BAKONG_ACQUIRING_BANK?: string
  readonly VITE_BAKONG_MCC?: string
  readonly VITE_BAKONG_MERCHANT_CITY?: string
  readonly VITE_BAKONG_CURRENCY?: string
  readonly VITE_BAKONG_COUNTRY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
