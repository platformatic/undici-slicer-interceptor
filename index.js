'use strict'

import findMyWay from 'find-my-way'
import { compile } from 'fgh'

/**
 * Creates an undici interceptor that adds cache-control headers based on specified rules.
 * The interceptor uses a router to match the request path and applies the corresponding
 * cache-control header to the response, but only for GET and HEAD requests, and only if
 * no cache-control header already exists. It can also add x-cache-tags headers based on
 * jq-style rules implemented via fgh.
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: Array<string>}>} rules - Array of rules for cache control
 * @param {string} rules[].routeToMatch - Path pattern to match for applying the cache rule
 * @param {string} rules[].cacheControl - Cache-Control header value to set for matching paths
 * @param {Array<string>} [rules[].cacheTags] - Array of jq-style expressions to generate cache tags from params, querystring, and request headers
 * @param {string} [rules[].cacheTags[]] - Expression for params using ".params.paramName"
 * @param {string} [rules[].cacheTags[]] - Expression for query parameters using ".querystring.paramName"
 * @param {string} [rules[].cacheTags[]] - Expression for request headers using ".headers[\"header-name\"]"
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
 *     {
 *       routeToMatch: '/static/*',
 *       cacheControl: 'public, max-age=86400',
 *       cacheTags: ["'static'"]
 *     },
 *     {
 *       routeToMatch: '/users/:id',
 *       cacheControl: 'public, max-age=3600',
 *       cacheTags: ["'user-' + .params.id"]
 *     },
 *     {
 *       routeToMatch: '/api/products',
 *       cacheControl: 'public, max-age=3600',
 *       cacheTags: [".querystring.category"]
 *     },
 *     {
 *       routeToMatch: '/api/auth',
 *       cacheControl: 'public, max-age=600',
 *       cacheTags: [".headers[\"x-tenant-id\"]", "'auth'"]
 *     }
 *   ],
 *   { ignoreTrailingSlash: true, caseSensitive: false }
 * )
 *
 * // This will add cache-control headers to GET and HEAD requests
 * // that don't already have a cache-control header, and x-cache-tags
 * // headers based on the provided jq-style expressions
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
    // Pre-compile the cache tag expressions if present
    if (rule.cacheTags && Array.isArray(rule.cacheTags)) {
      rule.compiledCacheTags = rule.cacheTags.map(expr => {
        try {
          return { expression: expr, compiled: compile(expr) }
        } catch (err) {
          throw new Error(`Error compiling cache tag expression: ${expr}. ${err.message}`)
        }
      })
    }

    // Register the route exactly as provided by the user
    router.on('GET', rule.routeToMatch, () => rule)
  }

  // Return the interceptor function
  return function cachingInterceptor (dispatch) {
    return function cachedDispatch (options, handler) {
      // Get the path from options
      const path = options.path || ''

      // Find matching route - pass the entire path to find-my-way
      // find-my-way will handle the path and querystring parsing
      const result = router.find('GET', path)
      const matchingRule = result ? result.handler() : null

      // Prepare request context for tag evaluation
      const context = matchingRule
        ? {
            path: result.path || path,
            params: result.params || {},
            querystring: result.searchParams || {},
            // Added support for normalized header access
            // Convert all header keys to lowercase for consistent access
            headers: (() => {
              const normalizedHeaders = {}
              const headers = options.headers || {}
              for (const key in headers) {
                normalizedHeaders[key.toLowerCase()] = headers[key]
              }
              return normalizedHeaders
            })()
          }
        : null

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
              rawHeaders.push('cache-control', matchingRule.cacheControl)
            }

            // Add x-cache-tags header if rule has compiled cache tags and we have a context
            if (matchingRule.compiledCacheTags && matchingRule.compiledCacheTags.length > 0 && context) {
              let hasCacheTags = false
              for (let i = 0; i < rawHeaders.length; i += 2) {
                const headerName = String(rawHeaders[i]).toLowerCase()
                if (headerName === 'x-cache-tags') {
                  hasCacheTags = true
                  break
                }
              }

              if (!hasCacheTags) {
                // Evaluate each tag expression and collect results
                const evaluatedTags = []

                for (const tagInfo of matchingRule.compiledCacheTags || []) {
                  try {
                    // Use the pre-compiled fgh expression
                    const tagResults = tagInfo.compiled(context)

                    // Only add non-null, non-undefined tag values
                    for (const tag of tagResults) {
                      if (tag != null && tag !== '') {
                        evaluatedTags.push(String(tag))
                      }
                    }
                  } catch (err) {
                    // Skip expressions that fail at runtime
                    console.error(`Error evaluating cache tag expression: ${tagInfo.expression}`, err)
                  }
                }

                // Add the x-cache-tags header if we have any evaluated tags
                if (evaluatedTags.length > 0) {
                  rawHeaders.push('x-cache-tags', evaluatedTags.join(','))
                }
              }
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
