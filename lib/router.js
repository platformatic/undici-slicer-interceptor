import findMyWay from 'find-my-way'
import { compile } from 'fgh'

/**
 * Extracts the origin (host + port) from request options
 *
 * @param {Object} options - Request options
 * @returns {string} Origin string or a default value if origin can't be determined
 */
export function extractOrigin(options) {
  if (options.origin) {
    return options.origin
  }

  // Try to extract from headers
  if (options.headers && (options.headers.host || options.headers.Host)) {
    const hostHeader = options.headers.host || options.headers.Host
    return hostHeader
  }

  // Use hostname and port if available
  if (options.hostname || options.host) {
    const host = options.hostname || options.host
    const port = options.port ? `:${options.port}` : ''
    const protocol = options.protocol || 'http:'
    return `${protocol}//${host}${port}`
  }

  // If we can't determine the origin, use a default value
  return 'default-origin'
}

/**
 * Pre-compiles cache tag expressions for all rules
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} rules - Rules for cache control
 * @returns {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string, compiledCacheTag?: Function}>} Rules with compiled cache tag expressions
 */
export function precompileCacheTags(rules) {
  // Clone the rules to avoid modifying the input
  const processedRules = [...rules]

  // Pre-compile the cache tag expressions
  for (const rule of processedRules) {
    if (rule.cacheTags && typeof rule.cacheTags === 'string' && !rule.compiledCacheTag) {
      try {
        rule.compiledCacheTag = compile(rule.cacheTags)
      } catch (err) {
        throw new Error(`Error compiling cache tag expression: ${rule.cacheTags}. ${err.message}`)
      }
    }
  }

  return processedRules
}

/**
 * Creates a router manager that maintains separate routers per origin
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} rules - Rules for cache control
 * @param {Object} options - Router options
 * @returns {Object} Origin-based router manager
 */
export function createRouter(rules, options) {
  // Pre-compile cache tag expressions for all rules first
  const processedRules = precompileCacheTags(rules)

  // Store routers by origin
  const routers = new Map()

  // Function to get or create a router for a specific origin
  const getRouterForOrigin = (origin) => {
    // If we already have a router for this origin, return it
    if (routers.has(origin)) {
      return routers.get(origin)
    }

    // Create a new router for this origin
    const router = findMyWay({
      ignoreTrailingSlash: options.ignoreTrailingSlash !== undefined ? options.ignoreTrailingSlash : false,
      ignoreDuplicateSlashes: options.ignoreDuplicateSlashes !== undefined ? options.ignoreDuplicateSlashes : false,
      maxParamLength: options.maxParamLength !== undefined ? options.maxParamLength : 100,
      caseSensitive: options.caseSensitive !== undefined ? options.caseSensitive : true,
      useSemicolonDelimiter: options.useSemicolonDelimiter !== undefined ? options.useSemicolonDelimiter : false,
      defaultRoute: () => null
    })

    // Register all rules with the router
    for (const rule of processedRules) {
      // Register the route exactly as provided by the user
      router.on('GET', rule.routeToMatch, () => rule)
    }

    // Store and return the new router
    routers.set(origin, router)
    return router
  }

  // Return the router manager interface
  return {
    /**
     * Find a matching route for the given method and path, using the appropriate
     * router for the specified origin
     *
     * @param {string} method - HTTP method
     * @param {string} path - Request path
     * @param {Object} options - Request options
     * @returns {Object|null} Route match result or null if no match
     */
    find(method, path, options) {
      const origin = extractOrigin(options)
      const router = getRouterForOrigin(origin)
      return router.find(method, path)
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
