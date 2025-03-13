/**
 * Extracts the origin (host:port) from request options
 *
 * @param {Object} options - Request options
 * @returns {{origin: string}} Origin string
 */
export function extractOrigin (options) {
  let origin = ''

  // First priority: host header (if present)
  if (options.headers && options.headers.host) {
    origin = options.headers.host
  }

  // Second priority: origin property
  if (!origin && options.origin) {
    try {
      const url = new URL(options.origin)
      origin = url.host // This gives us hostname:port (or just hostname if default port)
    } catch (e) {
      origin = options.origin
    }
  }

  // Third priority: hostname and port
  if (!origin && (options.hostname || options.host)) {
    const host = options.hostname || options.host
    const port = options.port ? `:${options.port}` : ''
    origin = `${host}${port}`
  }

  return { origin }
}
