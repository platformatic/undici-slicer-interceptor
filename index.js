'use strict'

/**
 * Creates an undici interceptor that adds cache-control headers based on specified rules.
 * The interceptor inspects the request path and applies the matching cache-control header to the response.
 * Rules are matched by prefix, with longer paths taking precedence over shorter ones.
 * 
 * @param {Array<{routeToMatch: string, cacheControl: string}>} rules - Array of rules for cache control
 * @param {string} rules[].routeToMatch - Path prefix to match for applying the cache rule
 * @param {string} rules[].cacheControl - Cache-Control header value to set for matching paths
 * @returns {Function} - An undici interceptor function that can be composed with a dispatcher
 * 
 * @example
 * ```js
 * import { Agent } from 'undici'
 * import { createInterceptor } from 'make-cacheable-interceptor'
 * 
 * const agent = new Agent()
 * const interceptor = createInterceptor([
 *   { routeToMatch: '/static', cacheControl: 'public, max-age=86400' },
 *   { routeToMatch: '/api', cacheControl: 'no-store' }
 * ])
 * 
 * const composedAgent = agent.compose(interceptor)
 * setGlobalDispatcher(composedAgent)
 * ```
 */
export function createInterceptor(rules) {
  // Validate rules
  if (!Array.isArray(rules)) {
    throw new Error('Rules must be an array')
  }
  
  // Validate each rule
  rules.forEach(rule => {
    if (!rule.routeToMatch || typeof rule.routeToMatch !== 'string') {
      throw new Error('Each rule must have a routeToMatch string')
    }
    if (!rule.cacheControl || typeof rule.cacheControl !== 'string') {
      throw new Error('Each rule must have a cacheControl string')
    }
  })

  // Sort rules by path length (longest first) to ensure more specific routes take precedence
  const sortedRules = [...rules].sort((a, b) => 
    b.routeToMatch.length - a.routeToMatch.length
  )

  // Return the interceptor function
  return function cachingInterceptor(dispatch) {
    return function cachedDispatch(options, handler) {
      // Find a matching rule for this path
      const path = options.path || ''
      const matchingRule = sortedRules.find(rule => path.startsWith(rule.routeToMatch))
      
      // Create a handler wrapper that will modify the response headers
      return dispatch(options, {
        // Pass through original handler methods
        onConnect: handler.onConnect?.bind(handler),
        onError: handler.onError?.bind(handler),
        onUpgrade: handler.onUpgrade?.bind(handler),
        
        // Intercept onHeaders to modify headers
        onHeaders: function(statusCode, rawHeaders, resume, statusMessage) {
          // Only modify headers if we have a matching rule
          if (matchingRule) {
            // Remove any existing cache-control headers
            for (let i = 0; i < rawHeaders.length; i += 2) {
              const headerName = String(rawHeaders[i]).toLowerCase()
              if (headerName === 'cache-control') {
                // Remove this header and its value
                rawHeaders.splice(i, 2)
                // Adjust the index since we removed two items
                i -= 2
              }
            }
            
            // Add our cache-control header
            rawHeaders.push('cache-control', matchingRule.cacheControl)
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
