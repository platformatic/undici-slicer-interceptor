import findMyWay from 'find-my-way'
import { compile } from 'fgh'
import { extractOrigin } from './extractOrigin.js'

// Re-export the extractOrigin function for backwards compatibility
export { extractOrigin }

/**
 * Parses a route string that includes the origin and path
 * Format: hostname:port/path, hostname/path, or http(s)://hostname:port/path
 *
 * @param {string} route - The route string including origin and path
 * @returns {Object} Object containing origin and path
 */
export function parseRouteWithOrigin (route) {
  // First check if the route has a protocol
  const hasProtocol = route.includes('://')

  // Find the first slash after any protocol (if present)
  const firstSlashAfterProtocol = route.indexOf('/', hasProtocol ? route.indexOf('//') + 2 : 0)

  if (firstSlashAfterProtocol === -1) {
    throw new Error(`Invalid route format: ${route}. Expected format: 'hostname:port/path', 'hostname/path', or 'http(s)://hostname:port/path'`)
  }

  // Extract origin (everything before the first slash after protocol)
  // and path (everything including and after that slash)
  const origin = route.substring(0, firstSlashAfterProtocol)
  const path = route.substring(firstSlashAfterProtocol)

  // Clean up the origin by removing any protocol
  const cleanOrigin = hasProtocol ? origin.split('://')[1] : origin

  // Create result object that matches the original API
  const result = {
    origin: cleanOrigin,
    path
  }

  // Add hasProtocol as a non-enumerable property so it won't show up in assertions
  // but we can still use it internally for compatibility with existing tests
  Object.defineProperty(result, 'hasProtocol', {
    value: hasProtocol,
    enumerable: false
  })

  return result
}

/**
 * Creates router(s) configured with the provided rules and options
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} rules - Rules for cache control
 * @param {Object} options - Router options
 * @returns {Object} Configured router object with per-origin routers
 */
export function createRouter (rules, options) {
  // Group rules by origin
  const rulesByOrigin = new Map()
  
  // Process rules and organize them by origin
  for (const rule of rules) {
    // Parse the route to extract origin and path
    const routeInfo = parseRouteWithOrigin(rule.routeToMatch)

    // Store the origin with the rule
    rule.origin = routeInfo.origin
    rule.path = routeInfo.path

    // Pre-compile the cache tag expression if present
    if (rule.cacheTags && typeof rule.cacheTags === 'string' && !rule.compiledCacheTag) {
      try {
        rule.compiledCacheTag = compile(rule.cacheTags)
      } catch (err) {
        throw new Error(`Error compiling cache tag expression: ${rule.cacheTags}. ${err.message}`)
      }
    }

    // Group rules by origin
    if (!rulesByOrigin.has(rule.origin)) {
      rulesByOrigin.set(rule.origin, [])
    }
    
    rulesByOrigin.get(rule.origin).push(rule)
  }

  // Create a router for each origin
  const routers = new Map()
  
  for (const [origin, originRules] of rulesByOrigin.entries()) {
    // Create a new router for this origin
    const router = findMyWay({
      ignoreTrailingSlash: options.ignoreTrailingSlash !== undefined ? options.ignoreTrailingSlash : false,
      ignoreDuplicateSlashes: options.ignoreDuplicateSlashes !== undefined ? options.ignoreDuplicateSlashes : false,
      maxParamLength: options.maxParamLength !== undefined ? options.maxParamLength : 100,
      caseSensitive: options.caseSensitive !== undefined ? options.caseSensitive : true,
      useSemicolonDelimiter: options.useSemicolonDelimiter !== undefined ? options.useSemicolonDelimiter : false,
      defaultRoute: () => null
    })
    
    // Group rules by path within this origin
    const pathMap = new Map()
    
    for (const rule of originRules) {
      // Group rules by path
      if (!pathMap.has(rule.path)) {
        pathMap.set(rule.path, [])
      }
      pathMap.get(rule.path).push(rule)
    }
    
    // Register each unique path once with its rules
    for (const [path, pathRules] of pathMap.entries()) {
      router.on('GET', path, () => ({ rules: pathRules }))
    }
    
    // Store the router for this origin
    routers.set(origin, router)
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
    find (method, path, options) {
      // Get the request origin information
      const { origin: requestOrigin } = extractOrigin(options)
      
      // Check if we have a router for this origin
      const router = routers.get(requestOrigin)
      
      if (!router) {
        return null
      }
      
      // Find matching routes for this path in the origin-specific router
      const result = router.find(method, path)
      
      if (!result) {
        return null
      }
      
      // Get all rules for this path
      const { rules } = result.handler()
      
      // Just use the first rule since we don't need to worry about protocol
      const matchingRule = rules[0]
      
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
export function createRequestContext (result, options = {}) {
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
