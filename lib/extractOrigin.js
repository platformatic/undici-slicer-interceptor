/**
 * Extracts the origin (host:port) from request options with better protocol handling
 *
 * @param {Object} options - Request options
 * @returns {{origin: string, hasProtocol: boolean}} Origin string and protocol flag
 */
export function extractOrigin (options) {
  let origin = ''
  let hasProtocol = false
  let fromHostHeader = false

  // First priority: host header (if present)
  if (options.headers) {
    const hostHeader = options.headers.host || options.headers.Host
    if (hostHeader) {
      origin = hostHeader
      fromHostHeader = true
      // When origin comes from host header, we consider it as NOT having a protocol
      hasProtocol = false
    }
  }

  // Second priority: origin property
  if (!origin && options.origin) {
    // Check if the request has a protocol
    hasProtocol = options.origin.includes('://')

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
    hasProtocol = false
  }

  return { origin, hasProtocol, fromHostHeader }
}
