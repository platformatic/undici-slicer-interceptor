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

  return { origin: cleanOrigin, path }
}

/**
 * Creates a router configured with the provided rules and options
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} rules - Rules for cache control
 * @param {Object} options - Router options
 * @returns {Object} Configured router
 */
export function createRouter (rules, options) {
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

    // Store whether the original route had a protocol
    rule.hadProtocol = rule.routeToMatch.includes('://')

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
    find (method, path, options) {
      // Get the request origin and protocol information
      const { origin: requestOrigin, hasProtocol: requestHasProtocol, fromHostHeader } = extractOrigin(options)

      // Find matching routes based only on the path
      const result = router.find(method, path)

      if (!result) {
        return null
      }

      // Get all rules for this path
      const { rules } = result.handler()

      // If the origin came from the Host header, we always prioritize the non-protocol version,
      // otherwise use the request's protocol status
      const effectiveHasProtocol = fromHostHeader ? false : requestHasProtocol

      // First, try to find a rule with a matching origin that also has the same protocol state
      let matchingRule = rules.find(rule => {
        return rule.origin === requestOrigin && rule.hadProtocol === effectiveHasProtocol
      })

      // If no exact protocol match is found, fall back to any rule with matching origin
      if (!matchingRule) {
        // Prefer the rule without protocol first
        matchingRule = rules.find(rule => rule.origin === requestOrigin && !rule.hadProtocol)

        // If still no match, then try any rule with matching origin
        if (!matchingRule) {
          matchingRule = rules.find(rule => rule.origin === requestOrigin)
        }
      }

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
