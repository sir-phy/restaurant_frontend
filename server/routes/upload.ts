import { Router, Request, Response } from 'express'
import { authenticate, requireRole } from '../auth.js'

export const uploadRouter = Router()

// Minimal magic-byte sniffing, mirroring the real backend's validation so the
// mock rejects the same payloads the real endpoint would.
const detectImage = (buffer: Buffer): { ext: string; mime: string } | null => {
  if (
    buffer.length >= 8 &&
    buffer.readUInt32BE(0) === 0x89504e47 &&
    buffer.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return { ext: 'png', mime: 'image/png' }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' }
  }
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'GIF8') {
    return { ext: 'gif', mime: 'image/gif' }
  }
  return null
}

const decodeBase64Image = (image: string): Buffer => {
  const dataUrlMatch = image.match(/^data:image\/[a-zA-Z.+]+;base64,(.*)$/s)
  const base64 = dataUrlMatch ? dataUrlMatch[2] : image
  if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    throw new Error('Image data is not a valid base64 string')
  }
  return Buffer.from(base64, 'base64')
}

const IMAGE_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// POST /api/upload/image — MANAGER
// Mock upload: validates the image exactly like the real backend, then returns
// the data URL as the public URL (the mock has no persistent disk storage, so
// the data URL is the only durable representation available).
uploadRouter.post('/image', authenticate, requireRole(['MANAGER']), (req: Request, res: Response) => {
  const { image } = req.body

  if (!image || typeof image !== 'string') {
    return res.status(400).json({
      message: 'No image data provided',
      errors: ['IMAGE_REQUIRED']
    })
  }

  let buffer: Buffer
  try {
    buffer = decodeBase64Image(image)
  } catch (err: any) {
    return res.status(400).json({
      message: err.message || 'Invalid base64 image data',
      errors: ['UPLOAD_ERROR']
    })
  }

  const detected = detectImage(buffer)
  if (!detected) {
    return res.status(400).json({
      message: 'Uploaded file is not a supported image (PNG, JPG, WEBP, GIF)',
      errors: ['UPLOAD_ERROR']
    })
  }

  if (buffer.length > IMAGE_MAX_BYTES) {
    return res.status(413).json({
      message: 'Image is too large (max 5MB)',
      errors: ['UPLOAD_ERROR']
    })
  }

  // Return the data URL as the "public URL" — in the mock this is the only
  // durable representation since there is no static file serving.
  return res.status(201).json({
    message: 'Image uploaded successfully',
    data: {
      url: image,
      filename: `mock-${Date.now()}.${detected.ext}`,
      mime: detected.mime,
      size: buffer.length
    }
  })
})
