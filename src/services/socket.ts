import { io, Socket } from 'socket.io-client'
import { getAccessToken } from './api.js'
import { SOCKET_URL } from './config.js'

let socketInstance: Socket | null = null

export const getSocket = (): Socket => {
  const token = getAccessToken()

  if (socketInstance) {
    if (socketInstance.connected) {
      return socketInstance
    }
  }

  socketInstance = io(SOCKET_URL, {
    auth: {
      token: token || ''
    },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  })

  socketInstance.on('connect_error', (err) => {
    console.warn('Socket connect error:', err.message)
  })

  return socketInstance
}

export const joinTableRoom = (
  tableId: number | string,
): Promise<{ ok: boolean; tableId?: number }> => {
  return new Promise((resolve) => {
    const socket = getSocket()
    if (!tableId) return resolve({ ok: false })
    socket.emit(
      'join:table',
      tableId,
      (res: { ok: boolean; tableId?: number }) => {
        resolve(res ?? { ok: true })
      },
    )
  })
}

export const joinOrderRoom = (orderId: number | string): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = getSocket()
    if (!orderId) return resolve(false)
    socket.emit('join:order', orderId, (res: { ok: boolean }) => {
      resolve(res ? res.ok : true)
    })
  })
}

export const joinCashierRoom = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = getSocket()
    socket.emit('join:cashier', {}, (res: { ok: boolean }) => {
      resolve(res ? res.ok : true)
    })
  })
}

export const joinKitchenRoom = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = getSocket()
    socket.emit('join:kitchen', {}, (res: { ok: boolean }) => {
      resolve(res ? res.ok : true)
    })
  })
}

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
}
