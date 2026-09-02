import QRCode from 'qrcode'

const QR_DARK = '#0f172a'
const QR_LIGHT = '#ffffff'
const GOLD = '#f59e0b'

export const renderQrDataUrl = (url: string, width = 512): Promise<string> =>
  QRCode.toDataURL(url, {
    width,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: QR_DARK, light: QR_LIGHT },
  })

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

/** Branded tent-card PNG (URL + table number + QR) for download / print. */
export const renderTableQrPoster = async (opts: {
  tableNo: string
  url: string
  name?: string | null
  location?: string | null
}): Promise<string> => {
  const W = 1080
  const H = 1480
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')

  ctx.fillStyle = QR_DARK
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = GOLD
  ctx.lineWidth = 10
  roundRect(ctx, 40, 40, W - 80, H - 80, 36)
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.font = '800 78px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('TosEat.', W / 2, 170)

  ctx.fillStyle = GOLD
  ctx.font = '800 22px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('SCAN TO ORDER', W / 2, 230)

  const cardX = 140
  const cardY = 280
  const cardW = 800
  const cardH = 900
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, cardX, cardY, cardW, cardH, 40)
  ctx.fill()

  const qr = await renderQrDataUrl(opts.url, 720)
  const qrImg = await loadImage(qr)
  ctx.drawImage(qrImg, 200, 310, 680, 680)

  ctx.fillStyle = QR_DARK
  ctx.font = '800 58px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(`TABLE ${opts.tableNo}`, W / 2, 1078)

  const subtitle = [opts.name, opts.location].filter(Boolean).join(' · ')
  if (subtitle) {
    ctx.fillStyle = '#64748b'
    ctx.font = '700 24px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(subtitle, W / 2, 1120)
  }

  ctx.fillStyle = '#94a3b8'
  ctx.font = '600 20px ui-monospace, SFMono-Regular, Menlo, monospace'
  const urlLabel = opts.url.replace(/^https?:\/\//, '')
  ctx.fillText(urlLabel.length > 48 ? `${urlLabel.slice(0, 46)}…` : urlLabel, W / 2, 1320)

  ctx.fillStyle = GOLD
  ctx.font = '700 20px Inter, ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('Point your camera at this code to open the menu', W / 2, 1380)

  return canvas.toDataURL('image/png')
}

export const downloadDataUrl = (dataUrl: string, filename: string) => {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export const printPoster = (dataUrl: string, title: string) => {
  const frame = window.open('', '_blank', 'width=520,height=740')
  if (!frame) {
    throw new Error('Popup blocked')
  }
  frame.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title.replace(/</g, '')}</title>
  <style>
    @page { size: A6 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: #0f172a; }
    img { display: block; width: 100%; height: auto; }
  </style>
</head>
<body>
  <img id="card" alt="${title.replace(/"/g, '')}" src="${dataUrl}" />
  <script>
    const img = document.getElementById('card');
    const go = () => { window.focus(); window.print(); };
    if (img.complete) go();
    else img.onload = go;
  <\/script>
</body>
</html>`)
  frame.document.close()
}
