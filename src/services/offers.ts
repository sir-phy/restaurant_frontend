import { api } from './api.js'

export interface Promotion {
  id: number
  menuItemId: number
  name: string
  image?: string | null
  originalPrice: number
  promoPrice: number
  discountPercent: number
  rating: number
  reviewCount: string
  status: string
  sortOrder: number
}

export interface PairingItem {
  id: number
  name: string
  image?: string | null
  price: number
}

export interface Pairing {
  id: number
  name: string
  description?: string | null
  badge?: string | null
  comboPrice: number
  status: string
  sortOrder: number
  left: PairingItem
  right: PairingItem
}

export const promotionService = {
  list: (status?: string) =>
    api.get<Promotion[]>(status ? `/promotions?status=${status}` : '/promotions'),
  create: (data: {
    menuItemId: number
    discountPercent: number
    promoPrice?: number
    rating?: number
    reviewCount?: string
    status?: string
  }) => api.post<Promotion>('/promotions', data),
  update: (id: number, data: Partial<{
    menuItemId: number
    discountPercent: number
    promoPrice: number
    rating: number
    reviewCount: string
    status: string
  }>) => api.put<Promotion>(`/promotions/${id}`, data),
  remove: (id: number) => api.delete(`/promotions/${id}`),
}

export const pairingService = {
  list: (status?: string) =>
    api.get<Pairing[]>(status ? `/pairings?status=${status}` : '/pairings'),
  create: (data: {
    name?: string
    description?: string
    leftMenuItemId: number
    rightMenuItemId: number
    comboPrice: number
    badge?: string | null
    status?: string
  }) => api.post<Pairing>('/pairings', data),
  update: (id: number, data: Partial<{
    name: string
    description: string
    leftMenuItemId: number
    rightMenuItemId: number
    comboPrice: number
    badge: string | null
    status: string
  }>) => api.put<Pairing>(`/pairings/${id}`, data),
  remove: (id: number) => api.delete(`/pairings/${id}`),
}
