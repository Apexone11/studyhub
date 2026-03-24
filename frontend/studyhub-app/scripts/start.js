/* global process */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.PORT || 3000)
const host = '0.0.0.0'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')
const runtimeConfigPath = path.join(distDir, 'runtime-config.js')
const defaultSupportEmail = 'abdulrfornah@getstudyhub.org'

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function resolveRequestPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0] || '/')
  const requestedPath = cleanPath === '/' ? '/index.html' : cleanPath
  const absolutePath = path.normalize(path.join(distDir, requestedPath))

  if (!absolutePath.startsWith(distDir)) {
    return null
  }

  if (existsSync(absolutePath)) {
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) {
      const indexPath = path.join(absolutePath, 'index.html')
      if (existsSync(indexPath)) return indexPath
    } else {
      return absolutePath
    }
  }

  return path.join(distDir, 'index.html')
}

function sendFile(filePath, res) {
  const extension = path.extname(filePath).toLowerCase()
  const contentType = mimeTypes[extension] || 'application/octet-stream'

  res.writeHead(200, { 'Content-Type': contentType })
  createReadStream(filePath).pipe(res)
}

function writeRuntimeConfig() {
const config = {
    API: process.env.VITE_API_URL || process.env.API_URL || 'http://localhost:4000',
    SUPPORT_EMAIL: process.env.VITE_SUPPORT_EMAIL || defaultSupportEmail,
    CLARITY_PROJECT_ID: process.env.VITE_CLARITY_PROJECT_ID || '',
    GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID || '',
    GOOGLE_ADS_ID: process.env.VITE_GOOGLE_ADS_ID || '',
    GOOGLE_ADS_SIGNUP_CONVERSION_LABEL:
      process.env.VITE_GOOGLE_ADS_SIGNUP_CONVERSION_LABEL || '',
  }

  writeFileSync(
    runtimeConfigPath,
    `window.__STUDYHUB_CONFIG__ = ${JSON.stringify(config)};\n`,
    'utf8'
  )
}

writeRuntimeConfig()

const server = createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Bad request')
    return
  }

  const filePath = resolveRequestPath(req.url)
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  sendFile(filePath, res)
})

server.listen(port, host, () => {
  console.log(`Accepting connections at http://${host}:${port}`)
})
