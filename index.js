'use strict'

import findMyWay from 'find-my-way'

/**
 * Creates an undici interceptor that adds cache-control headers based on specified rules.
 * The interceptor uses a router to match the request path and applies the corresponding
 * cache-control header to the response, but only for GET and HEAD requests, and only if
 * no cache-control header already exists.
 *
 * @param {Array<{routeToMatch: string, cacheControl: string}>} rules - Array of rules for cache control
 * @param {string} rules[].routeToMatch - Path pattern to match for applying the cache rule
 * @param {string} rules[].cacheControl - Cache-Control header value to set for matching paths
 * @param {Object} [options] - Options for the find-my-way router
 * @param {boolean} [options.ignoreTrailingSlash=false] - Ignore trailing slashes in routes
 * @param {boolean} [options.ignoreDuplicateSlashes=false] - Ignore duplicate slashes in routes
 * @param {number} [options.maxParamLength=100] - Maximum length of a parameter
 * @param {boolean} [options.caseSensitive=true] - Use case sensitive routing
 * @param {boolean} [options.useSemicolonDelimiter=false] - Use semicolon instead of ampersand as query param delimiter
 * @returns {Function} - An undici interceptor function that can be composed with a dispatcher
 *
 * @example
 * ```js
 * import { Agent } from 'undici'
 * import { createInterceptor } from 'make-cacheable-interceptor'
 *
 * const agent = new Agent()
 * const interceptor = createInterceptor(
 *   [
 *     { routeToMatch: '/static/*', cacheControl: 'public, max-age=86400' },
 *     { routeToMatch: '/api/*', cacheControl: 'no-store' }
 *   ],
 *   { ignoreTrailingSlash: true, caseSensitive: false }
 * )
 *
 * // This will add cache-control headers to GET and HEAD requests
 * // that don't already have a cache-control header
 * const composedAgent = agent.compose(interceptor)
 * setGlobalDispatcher(composedAgent)
 * ```
 */
export function createInterceptor (rules, options = {}) {
  // Validate rules
  if (!Array.isArray(rules)) {
    throw new Error('Rules must be an array')
  }

  // Validate each rule
  for (const rule of rules) {
    if (!rule.routeToMatch || typeof rule.routeToMatch !== 'string') {
      throw new Error('Each rule must have a routeToMatch string')
    }
    if (!rule.cacheControl || typeof rule.cacheControl !== 'string') {
      throw new Error('Each rule must have a cacheControl string')
    }
  }

  // Sort rules by path length (longest first) to ensure more specific routes are registered first
  const sortedRules = [...rules].sort((a, b) =>
    b.routeToMatch.length - a.routeToMatch.length
  )

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
  for (const rule of sortedRules) {
    // Register the route exactly as provided by the user
    router.on('GET', rule.routeToMatch, () => rule.cacheControl)
  }

  // Return the interceptor function
  return function cachingInterceptor (dispatch) {
    return function cachedDispatch (options, handler) {
      // Get the path from options
      const path = options.path || ''

      // Extract the pathname from the path (which might include querystring)
      let pathname = path
      const queryIndex = path.indexOf('?')
      if (queryIndex !== -1) {
        pathname = path.substring(0, queryIndex)
      }

      // Find matching route
      const result = router.find('GET', pathname)
      const matchingRule = result ? result.handler() : null

      // Create a handler wrapper that will modify the response headers
      return dispatch(options, {
        // Pass through original handler methods
        onConnect: handler.onConnect?.bind(handler),
        onError: handler.onError?.bind(handler),
        onUpgrade: handler.onUpgrade?.bind(handler),

        // Intercept onHeaders to modify headers
        onHeaders: function (statusCode, rawHeaders, resume, statusMessage) {
          // Only modify headers if we have a matching rule and it's a GET or HEAD request
          const method = options.method ? options.method.toUpperCase() : 'GET'
          if (matchingRule && (method === 'GET' || method === 'HEAD')) {
            // Check if there's already a cache-control header
            let hasCacheControl = false
            for (let i = 0; i < rawHeaders.length; i += 2) {
              const headerName = String(rawHeaders[i]).toLowerCase()
              if (headerName === 'cache-control') {
                hasCacheControl = true
                break
              }
            }

            // Only add our cache-control header if one doesn't exist
            if (!hasCacheControl) {
              rawHeaders.push('cache-control', matchingRule)
            }
          }

          // Call the original handler with the modified headers
          return handler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
        },

        // Pass through other handler methods
        onData: handler.onData?.bind(handler),
        onComplete: handler.onComplete?.bind(handler),
        onBodySent: handler.onBodySent?.bind(handler)
      })
    }
  }
}
