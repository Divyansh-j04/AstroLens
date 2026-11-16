// Talks to the AstroLens server. The address comes from VITE_API_URL (set at build time for the
// deployed page); during development it is the local uvicorn server.
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // must match MAX_UPLOAD_BYTES in backend/app/main.py
const TIMEOUT_MS = 90_000 // a sleeping free-tier server can take up to a minute to wake up
export const SLOW_AFTER_MS = 5_000 // after this, the page says the server may be waking up

/** An error whose message is safe to show to the user as it is. */
export class UploadError extends Error {}

/** Checks done in the browser before uploading, so an obviously bad file never leaves the page. */
export function checkFile(file) {
  if (!file.type.startsWith('image/')) throw new UploadError('That file is not an image. Please choose a JPEG, PNG or WebP photo.')
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('That image is larger than 8 MB. Please choose a smaller photo.')
}

/** POST /classify. Resolves to the server's answer; rejects with an UploadError carrying a plain message. */
export async function classifyImage(file) {
  checkFile(file)
  const body = new FormData()
  body.append('file', file)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response
  try {
    response = await fetch(`${API_URL}/classify`, { method: 'POST', body, signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError') throw new UploadError('The server took too long to answer. Please try again in a minute.')
    throw new UploadError("Can't reach the AstroLens server. Check your connection, or try again in a minute.")
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.json()).detail
    } catch {
      // not a JSON error body
    }
    if (response.status === 502 || response.status === 503 || response.status === 504)
      throw new UploadError(detail || 'The server is starting up. Please try again in a minute.')
    throw new UploadError(detail || `The server could not classify that image (error ${response.status}).`)
  }
  return response.json()
}
