import { api } from './api.js'

export interface PaymentItem {
  id: number
  billingRequestId?: number
  orderId?: number
  tableId: number
  amount: number
  currency: 'USD' | 'KHR'
  method: 'CASH' | 'KHQR' | 'CARD'
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED'
  amountReceived?: number
  changeAmount?: number
  qrData?: string
  md5?: string
  hash?: string
  shortHash?: string
  transactionReference?: string
  paidAt?: string | null
  createdAt: string
  updatedAt: string
  expiresAt?: string
}

/** Response of POST /api/payments/khqr/create (get-or-create semantics). */
export interface KhqrCreateResult {
  paymentId: number
  transactionNumber: string
  billingRequestId?: number
  tableId?: number
  amount: number
  currency: string
  status: 'PENDING' | 'PAID'
  /** Dynamic KHQR payload — render it as-is, never rebuild it client-side. */
  qrPayload: string
  expiresAt?: string
  /** True when an existing PENDING/PROCESSING payment was returned as-is. */
  alreadyPending?: boolean
}

export const paymentService = {
  // Cash payment
  payCash: (data: { billingRequestId?: number; orderId?: number; tableId?: number; amountReceived: number }) =>
    api.post<{ payment: PaymentItem; changeAmount: number; amountReceived: number; totalPaid: number }>('/payments/cash', data),

  // KHQR payment for single order (customer or cashier)
  generateKHQR: (orderId: number | string) =>
    api.post<{
      paymentId: number
      orderId: number
      amount: number
      currency: string
      status: 'PENDING' | 'PAID'
      /** Dynamic KHQR payload — render it as-is, never rebuild it client-side. */
      qr: string
      expiresAt: string
    }>('/payments/khqr', { orderId }),

  // KHQR payment for a table billing request (cashier POS or the requesting
  // customer). Idempotent: when a PENDING/PROCESSING payment already exists the
  // SAME payment (original QR) is returned with alreadyPending: true, so page
  // refreshes can never create a second payment.
  generateBillingKHQR: (billingRequestId: number | string) =>
    api.post<KhqrCreateResult>('/payments/khqr/create', { billingRequestId }),

  // Customer "resume my table payment" locator — resolves the caller's own
  // active billing request for the table and returns (or creates) its payment.
  generateTableKHQR: (tableId: number | string) =>
    api.post<KhqrCreateResult>('/payments/khqr/create', { tableId }),

  // Check KHQR payment with Bakong (cashier/manager screens)
  checkKHQR: (paymentId: number) =>
    api.post<{
      paymentId: number
      status: string
      amount: number
      currency: string
      md5: string
      isPaid: boolean
    }>('/payments/khqr/check', { paymentId }),

  // Get payment status (polling payload — lazy-marks expired KHQR payments)
  getPaymentStatus: (paymentId: number | string) =>
    api.get<{
      paymentId: number
      status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED'
      amount: number
      currency: string
      /** Bakong transaction hash — present once the payment is verified. */
      transactionHash?: string
      shortHash?: string
      paidAt?: string
      /** Backend-generated invoice id — fetch it to render the receipt. */
      invoiceId?: number
      expiresAt?: string
    }>(`/payments/${paymentId}/status`),

  // Ask the backend to verify the payment against Bakong (stored QR MD5).
  // The backend decides PAID/FAILED — the frontend never declares success.
  verifyPayment: (paymentId: number | string) =>
    api.post<{ message: string; paymentId: number; status: string } & Record<string, any>>(
      `/payments/${paymentId}/verify`
    ),

  // SANDBOX ONLY (server returns 403 unless BAKONG_SANDBOX=true): asks the
  // BACKEND to settle this KHQR payment through the real settlement + invoice
  // path. Success is still confirmed via getPaymentStatus polling.
  sandboxSettlePayment: (paymentId: number | string) =>
    api.post<{ message: string; paymentId: number; status: string } & Record<string, any>>(
      `/payments/${paymentId}/sandbox-settle`
    ),

  // Card payment
  payCard: (data: { billingRequestId?: number; orderId?: number; tableId?: number; transactionReference?: string }) =>
    api.post<{ payment: PaymentItem; totalPaid: number }>('/payments/card', data),

  // List payments history
  getPayments: (params?: {
    page?: number
    limit?: number
    status?: string
    method?: string
    dateFrom?: string
    dateTo?: string
    search?: string
  }) => {
    let query = ''
    if (params) {
      const q = new URLSearchParams()
      if (params.page) q.append('page', String(params.page))
      if (params.limit) q.append('limit', String(params.limit))
      if (params.status) q.append('status', params.status)
      if (params.method) q.append('method', params.method)
      if (params.dateFrom) q.append('dateFrom', params.dateFrom)
      if (params.dateTo) q.append('dateTo', params.dateTo)
      if (params.search) q.append('search', params.search)
      query = `?${q.toString()}`
    }
    return api.get<PaymentItem[]>(`/payments${query}`)
  },

  getPayment: (id: number | string) =>
    api.get<PaymentItem>(`/payments/${id}`),

  cancelPayment: (id: number | string) =>
    api.patch<PaymentItem>(`/payments/${id}/cancel`)
}
