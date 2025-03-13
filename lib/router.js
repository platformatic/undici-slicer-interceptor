import findMyWay from 'find-my-way'
import { compile } from 'fgh'

/**
 * Extracts the origin (host:port) from request options
 *
 * @param {Object} options - Request options
 * @returns {string} Origin string or empty string if origin can't be determined
 */
export function extractOrigin(options) {
  // First priority: host header (if present)
  if (options.headers) {
    const hostHeader = options.headers.host || options.headers.Host
    if (hostHeader) {
      return hostHeader
    }
  }
  
  // Second priority: origin property
  if (options.origin) {
    // Extract just the host:port part from the origin URL
    try {
      const url = new URL(options.origin)
      return url.host // This gives us hostname:port (or just hostname if default port)
    } catch (e) {
      return options.origin
    }
  }

  // Third priority: hostname and port
  if (options.hostname || options.host) {
    const host = options.hostname || options.host
    const port = options.port ? `:${options.port}` : ''
    return `${host}${port}`
  }

  return ''
}

/**
 * Parses a route string that includes the origin and path
 * Format: hostname:port/path or hostname/path
 *
 * @param {string} route - The route string including origin and path
 * @returns {Object} Object containing origin and path
 */
export function parseRouteWithOrigin(route) {
  // Find the first slash after any protocol (if present)
  const firstSlashAfterProtocol = route.indexOf('/', route.indexOf('//') > -1 ? route.indexOf('//') + 2 : 0)
  
  if (firstSlashAfterProtocol === -1) {
    throw new Error(`Invalid route format: ${route}. Expected format: 'hostname:port/path' or 'hostname/path'`)
  }
  
  // Extract origin (everything before the first slash after protocol)
  // and path (everything including and after that slash)
  const origin = route.substring(0, firstSlashAfterProtocol)
  const path = route.substring(firstSlashAfterProtocol)

  // Clean up the origin by removing any protocol
  const cleanOrigin = origin.includes('://') ? origin.split('://')[1] : origin

  return { origin: cleanOrigin, path }
}

/**
 * Creates a router configured with the provided rules and options
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} rules - Rules for cache control
 * @param {Object} options - Router options
 * @returns {Object} Configured router
 */
export function createRouter(rules, options) {
  // Create router instance with the provided options
  const router = findMyWay({
    ignoreTrailingSlash: options.ignoreTrailingSlash !== undefined ? options.ignoreTrailingSlash : false,
    ignoreDuplicateSlashes: options.ignoreDuplicateSlashes !== undefined ? options.ignoreDuplicateSlashes : false,
    maxParamLength: options.maxParamLength !== undefined ? options.maxParamLength : 100,
    caseSensitive: options.caseSensitive !== undefined ? options.caseSensitive : true,
    useSemicolonDelimiter: options.useSemicolonDelimiter !== undefined ? options.useSemicolonDelimiter : false,
    defaultRoute: () => null
  })

  // Group rules by path to avoid duplicate paths in router
  const pathMap = new Map()
  
  for (const rule of rules) {
    // Parse the route to extract origin and path
    const { origin, path } = parseRouteWithOrigin(rule.routeToMatch)
    
    // Store the origin with the rule
    rule.origin = origin
    
    // Pre-compile the cache tag expression if present
    if (rule.cacheTags && typeof rule.cacheTags === 'string' && !rule.compiledCacheTag) {
      try {
        rule.compiledCacheTag = compile(rule.cacheTags)
      } catch (err) {
        throw new Error(`Error compiling cache tag expression: ${rule.cacheTags}. ${err.message}`)
      }
    }
    
    // Group rules by path
    if (!pathMap.has(path)) {
      pathMap.set(path, [])
    }
    pathMap.get(path).push(rule)
  }
  
  // Register each unique path once, with an array of all rules for that path
  for (const [path, pathRules] of pathMap.entries()) {
    router.on('GET', path, () => ({ rules: pathRules }))
  }
  
  return {
    /**
     * Find a matching route for the given method, path, and origin
     * 
     * @param {string} method - HTTP method
     * @param {string} path - Request path
     * @param {Object} options - Request options
     * @returns {Object|null} Route match result or null if no match
     */
    find(method, path, options) {
      // Get the request origin
      const requestOrigin = extractOrigin(options)
      
      // Find matching routes based only on the path
      const result = router.find(method, path)
      
      if (!result) {
        return null
      }
      
      // Get all rules for this path
      const { rules } = result.handler()
      
      // Find the first rule that matches the origin
      const matchingRule = rules.find(rule => rule.origin === requestOrigin)
      
      if (!matchingRule) {
        return null
      }
      
      // Return the result with the matching rule
      const matchResult = { ...result }
      matchResult.handler = () => matchingRule
      return matchResult
    }
  }
}

/**
 * Creates a request context object from route result and request options
 *
 * @param {Object} result - find-my-way route result
 * @param {Object} options - Request options
 * @returns {Object} Context object for cache tag evaluation
 */
export function createRequestContext(result, options = {}) {
  const path = options.path || ''

  return {
    path: result.path || path,
    params: result.params || {},
    querystring: result.searchParams || {},
    // Normalize headers - convert keys to lowercase for consistent access
    headers: (() => {
      const normalizedHeaders = {}
      const headers = options.headers || {}
      for (const key in headers) {
        normalizedHeaders[key.toLowerCase()] = headers[key]
      }
      return normalizedHeaders
    })()
  }
}
