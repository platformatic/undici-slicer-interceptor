import { validateRules, sortRulesBySpecificity } from './lib/validator.js'
import { createRouter } from './lib/router.js'
import { createInterceptorFunction } from './lib/interceptor.js'

/**
 * Creates an undici interceptor that adds headers based on specified rules.
 * The interceptor uses a router to match the request path and applies the corresponding
 * headers to the response, but only for GET and HEAD requests, and only if
 * those headers don't already exist. It can also add cache tags headers and any other
 * dynamic headers based on jq-style rules implemented via fgh.
 *
 * @param {Array<{routeToMatch: string, headers?: Object}>} rules - Array of rules for headers
 * @param {string} rules[].routeToMatch - Origin and path pattern to match in format "hostname:port/path" or "hostname/path"
 * @param {Object} [rules[].headers] - Object containing headers to set. Values can be strings for static headers
 * (e.g., {"cache-control": "public, max-age=3600"}) or objects with an fgh property for dynamic headers based on
 * request context (e.g., {"x-cache-tags": { fgh: "'user', 'user-' + .params.userId" }})
 *
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
 *       headers: {
 *         'cache-control': 'public, max-age=86400',
 *         'x-custom-header': 'static-content',
 *         'x-cache-tags': { fgh: "'static', 'cdn'" }
 *       }
 *     },
 *     {
 *       routeToMatch: 'localhost:3042/users/:id',
 *       headers: {
 *         'cache-control': 'public, max-age=3600',
 *         'x-user-id': { fgh: ".params.id" },
 *         'x-cache-tags': { fgh: "'user-' + .params.id, 'type-user'" }
 *       }
 *     },
 *     {
 *       routeToMatch: 'localhost:3042/api/products',
 *       headers: {
 *         'cache-control': 'public, max-age=3600',
 *         'x-api-version': '1.0',
 *         'x-cache-tags': { fgh: ".querystring.category, 'products'" }
 *       }
 *     },
 *     {
 *       routeToMatch: 'api.example.com/api/auth',
 *       headers: {
 *         'cache-control': 'public, max-age=600',
 *         'x-security-level': 'high',
 *         'x-cache-tags': { fgh: ".headers[\"x-tenant-id\"], 'auth'" },
 *         'x-tenant': { fgh: ".headers[\"x-tenant-id\"]" }
 *       }
 *     }
 *   ],
 *   {
 *     ignoreTrailingSlash: true,
 *     caseSensitive: false,
 *     cacheTagsHeader: 'x-custom-cache-tags'
 *   }
 * )
 *
 * // This will add headers to GET and HEAD requests that don't already
 * // have those headers. Dynamic headers can use jq-style expressions
 * // to generate values based on request context.
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
