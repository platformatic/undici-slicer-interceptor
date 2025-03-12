import findMyWay from 'find-my-way'
import { compile } from 'fgh'

/**
 * Creates a router configured with the provided rules and options
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} rules - Rules for cache control
 * @param {Object} options - Router options
 * @returns {Object} Configured find-my-way router
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

  // Register all rules with the router
  for (const rule of rules) {
    // Pre-compile the cache tag expression if present
    if (rule.cacheTags && typeof rule.cacheTags === 'string') {
      try {
        rule.compiledCacheTag = compile(rule.cacheTags)
      } catch (err) {
        throw new Error(`Error compiling cache tag expression: ${rule.cacheTags}. ${err.message}`)
      }
    }

    // Register the route exactly as provided by the user
    router.on('GET', rule.routeToMatch, () => rule)
  }

  return router
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
