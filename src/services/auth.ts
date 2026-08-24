import { ref } from 'vue'
import { api, setAccessToken, removeAccessToken, getAccessToken } from './api.js'

export interface UserProfile {
  id: number
  name: string
  email: string
  role: 'MANAGER' | 'CASHIER' | 'CHEF' | 'CUSTOMER'
  role_id: number
  status: 'ACTIVE' | 'INACTIVE'
  tableId?: number | null
}

export const currentUser = ref<UserProfile | null>(null)
export const isAuthenticated = ref<boolean>(!!getAccessToken())

// The backend returns `role` (uppercase) and `status` as the lowercase DB value
// (e.g. 'active'). Normalize both so the rest of the app sees ACTIVE/INACTIVE.
const normalizeProfile = (user: any): UserProfile => ({
  id: Number(user.id),
  name: user.name,
  email: user.email,
  role: String(user.role || 'CUSTOMER').toUpperCase() as UserProfile['role'],
  role_id: Number(user.role_id ?? 0),
  status: String(user.status || 'active').toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
  tableId: user.tableId ?? null,
})

interface AuthResult {
  user: UserProfile
  accessToken: string
}

const completeAuth = (result: AuthResult): AuthResult => {
  setAccessToken(result.accessToken)
  currentUser.value = result.user
  isAuthenticated.value = true
  localStorage.setItem('gomeal_auth_user', JSON.stringify(result.user))
  return result
}

/**
 * Authenticates an existing account (staff: manager/cashier/chef) or, when the
 * caller supplies a CUSTOMER role / table id, provisions a lightweight guest.
 */
export const login = async (credentials: { email?: string; password?: string; role?: string; tableId?: number | string; name?: string }) => {
  const isGuest = credentials.role?.toUpperCase() === 'CUSTOMER' || (!credentials.email && credentials.tableId !== undefined)
  const res = isGuest
    ? await api.post<AuthResult>('/auth/guest', { name: credentials.name, tableId: credentials.tableId })
    : await api.post<AuthResult>('/auth/login', { email: credentials.email, password: credentials.password })

  if (res.data) {
    return completeAuth({ ...res.data, user: normalizeProfile(res.data.user) })
  }
  throw new Error('Login failed')
}

export const register = async (data: { name: string; email: string; password: string; role?: string }) => {
  const res = await api.post<AuthResult>('/auth/register', data)
  if (res.data) {
    return completeAuth({ ...res.data, user: normalizeProfile(res.data.user) })
  }
  throw new Error('Registration failed')
}

export const fetchMe = async (): Promise<UserProfile | null> => {
  const token = getAccessToken()
  if (!token) {
    currentUser.value = null
    isAuthenticated.value = false
    return null
  }

  try {
    const res = await api.get<UserProfile>('/auth/me')
    if (res.data) {
      currentUser.value = normalizeProfile(res.data)
      isAuthenticated.value = true
      localStorage.setItem('gomeal_auth_user', JSON.stringify(normalizeProfile(res.data)))
      return currentUser.value
    }
  } catch (e) {
    console.warn('Failed to verify user profile with server:', e)
    removeAccessToken()
    currentUser.value = null
    isAuthenticated.value = false
  }
  return null
}

export const logout = async () => {
  try {
    await api.post('/auth/logout')
  } catch (e) {
    // Ignore error
  } finally {
    removeAccessToken()
    currentUser.value = null
    isAuthenticated.value = false
    localStorage.removeItem('gomeal_auth_user')
  }
}

// Check stored cached user on load
try {
  const storedUser = localStorage.getItem('gomeal_auth_user')
  if (storedUser) {
    currentUser.value = JSON.parse(storedUser)
  }
} catch (e) {}
