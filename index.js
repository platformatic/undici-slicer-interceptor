import { validateRules, sortRulesBySpecificity } from './lib/validator.js'
import { createRouter } from './lib/router.js'
import { createInterceptorFunction } from './lib/interceptor.js'

/**
 * Creates an undici interceptor that adds cache-control headers based on specified rules.
 * The interceptor uses a router to match the request path and applies the corresponding
 * cache-control header to the response, but only for GET and HEAD requests, and only if
 * no cache-control header already exists. It can also add cache tags headers based on
 * jq-style rules implemented via fgh.
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} rules - Array of rules for cache control
 * @param {string} rules[].routeToMatch - Origin and path pattern to match in format "hostname:port/path" or "hostname/path"
 * @param {string} rules[].cacheControl - Cache-Control header value to set for matching paths
 * @param {string} [rules[].cacheTags] - JQ-style expression via fgh to generate cache tags from params, querystring, and request headers.
 * For multiple values, use comma-separated syntax like ".params.id, 'static'" or ".,." for multiple outputs.
 * @param {Object} [options] - Options for the find-my-way router
 * @param {boolean} [options.ignoreTrailingSlash=false] - Ignore trailing slashes in routes
 * @param {boolean} [options.ignoreDuplicateSlashes=false] - Ignore duplicate slashes in routes
 * @param {number} [options.maxParamLength=100] - Maximum length of a parameter
 * @param {boolean} [options.caseSensitive=true] - Use case sensitive routing
 * @param {boolean} [options.useSemicolonDelimiter=false] - Use semicolon instead of ampersand as query param delimiter
 * @param {string} [options.cacheTagsHeader='x-cache-tags'] - The name of the header to use for cache tags
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
 *       routeToMatch: 'localhost:3042/static/*',
 *       cacheControl: 'public, max-age=86400',
 *       cacheTags: "'static'"
 *     },
 *     {
 *       routeToMatch: 'localhost:3042/users/:id',
 *       cacheControl: 'public, max-age=3600',
 *       cacheTags: "'user-' + .params.id"
 *     },
 *     {
 *       routeToMatch: 'localhost:3042/api/products',
 *       cacheControl: 'public, max-age=3600',
 *       cacheTags: ".querystring.category"
 *     },
 *     {
 *       routeToMatch: 'api.example.com/api/auth',
 *       cacheControl: 'public, max-age=600',
 *       cacheTags: ".headers[\"x-tenant-id\"], 'auth'"
 *     }
 *   ],
 *   {
 *     ignoreTrailingSlash: true,
 *     caseSensitive: false,
 *     cacheTagsHeader: 'x-custom-cache-tags'
 *   }
 * )
 *
 * // This will add cache-control headers to GET and HEAD requests
 * // that don't already have a cache-control header, and cache tags
 * // headers based on the provided jq-style expressions
 * const composedAgent = agent.compose(interceptor)
 * setGlobalDispatcher(composedAgent)
 * ```
 */
export function createInterceptor (rules, options = {}) {
  // Default option for cache tags header name
  const cacheTagsHeader = options.cacheTagsHeader || 'x-cache-tags'

  // Validate rules
  validateRules(rules)

  // Sort rules by specificity
  const sortedRules = sortRulesBySpecificity(rules)

  // Create and configure router
  const router = createRouter(sortedRules, options)

  // Create and return the interceptor function
  return createInterceptorFunction(router, cacheTagsHeader)
}
