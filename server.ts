import { createServer } from 'http'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import express from 'express'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
  ? __dirname
  : path.resolve(process.cwd(), 'dist')

app.use(express.static(distPath))

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

const PORT = Number(process.env.PORT) || 3000

createServer(app).listen(PORT, '0.0.0.0', () => {
  console.log(`TosEat frontend serving on http://0.0.0.0:${PORT}`)
})
