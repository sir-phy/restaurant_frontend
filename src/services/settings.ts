import { api } from './api.js'

export interface RestaurantSettings {
  taxPercent: number
  serviceFeePercent: number
  restaurantLat: number | null
  restaurantLng: number | null
  orderRadiusM: number
}

export const settingsService = {
  getSettings: () => api.get<RestaurantSettings>('/settings'),

  updateSettings: (data: Partial<RestaurantSettings>) =>
    api.patch<RestaurantSettings>('/settings', data),
}
