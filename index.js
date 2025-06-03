import { validateRules, sortRulesBySpecificity } from './lib/validator.js'
import { createRouter } from './lib/router.js'
import { createInterceptorFunction } from './lib/interceptor.js'
import abstractLogging from 'abstract-logging'

/**
 * Creates an undici interceptor that adds headers based on specified rules.
 * The interceptor uses a router to match the request path and applies the corresponding
 * headers to the response, but only for GET and HEAD requests, and only if
 * those headers don't already exist. It can also add cache tags headers and any other
 * dynamic headers based on jq-style rules implemented via fgh.
 * Additionally, it can transform response bodies using fgh expressions.
 *
 * @param {Array<{routeToMatch: string, headers?: Object, responseBodyTransform?: Object}>} rules - Array of rules for headers and body transforms
 * @param {string} rules[].routeToMatch - Origin and path pattern to match in format "hostname:port/path" or "hostname/path"
 * @param {Object} [rules[].headers] - Object containing headers to set. Values can be strings for static headers
 * (e.g., {"cache-control": "public, max-age=3600"}) or objects with an fgh property for dynamic headers based on
 * request context (e.g., {"x-cache-tags": { fgh: "'user', 'user-' + .params.userId" }})
 * @param {Object} [rules[].responseBodyTransform] - Object with an fgh property containing an expression to transform the response body
 * (e.g., { fgh: ". + { cached: true }" })
 *
 * @param {Object} [options] - Options for the find-my-way router
 * @param {boolean} [options.ignoreTrailingSlash=false] - Ignore trailing slashes in routes
 * @param {boolean} [options.ignoreDuplicateSlashes=false] - Ignore duplicate slashes in routes
 * @param {number} [options.maxParamLength=100] - Maximum length of a parameter
 * @param {boolean} [options.caseSensitive=true] - Use case sensitive routing
 * @param {boolean} [options.useSemicolonDelimiter=false] - Use semicolon instead of ampersand as query param delimiter
 * @param {Object} [options.logger=abstract-logging] - Logger instance (pino compatible)
 * The logger can be any Pino-compatible logger. It will log interceptor operations
 * such as creation, rule validation, route matching, and header application.
 * @returns {Function} - An undici interceptor function that can be composed with a dispatcher
 *
 * @example
 * ```js
 * import { Agent } from 'undici'
 * import { createInterceptor } from 'make-cacheable-interceptor'
 *
 * const agent = new Agent()
 * const interceptor = createInterceptor(
 *   {
 *     rules: [
 *       {
 *         routeToMatch: 'localhost:3042/static/*',
 *         headers: {
 *           'cache-control': 'public, max-age=86400',
 *           'x-custom-header': 'static-content',
 *           'x-cache-tags': { fgh: "'static', 'cdn'" }
 *         }
 *       },
 *       {
 *         routeToMatch: 'localhost:3042/api/products/:productId',
 *         headers: {
 *           'cache-control': 'public, max-age=3600',
 *           'x-product-id': { fgh: '.params.productId' }
 *         },
 *         // Add a cached property and timestamp to the response
 *         responseBodyTransform: { fgh: '. + { cached: true, timestamp: .response.headers["date"] }' }
 *       },
 *       {
 *         routeToMatch: 'localhost:3042/users/:id',
 *         headers: {
 *           'cache-control': 'public, max-age=3600',
 *           'x-user-id': { fgh: ".params.id" },
 *           'x-cache-tags': { fgh: "'user-' + .params.id, 'type-user'" }
 *         }
 *       },
 *       {
 *         routeToMatch: 'localhost:3042/api/products',
 *         headers: {
 *           'cache-control': 'public, max-age=3600',
 *           'x-api-version': '1.0',
 *           'x-cache-tags': { fgh: ".querystring.category, 'products'" }
 *         }
 *       },
 *       {
 *         routeToMatch: 'api.example.com/api/auth',
 *         headers: {
 *           'cache-control': 'public, max-age=600',
 *           'x-security-level': 'high',
 *           'x-cache-tags': { fgh: ".headers[\"x-tenant-id\"], 'auth'" },
 *           'x-tenant': { fgh: ".headers[\"x-tenant-id\"]" }
 *         }
 *       }
 *     ],
 *     ignoreTrailingSlash: true,
 *     caseSensitive: false
 *   }
 * )
 *
 * // This will add headers to GET and HEAD requests that don't already
 * // have those headers. Dynamic headers can use jq-style expressions
 * // to generate values based on request context.
 * const composedAgent = agent.compose(interceptor)
 * setGlobalDispatcher(composedAgent)
 * ```
 *
 * The `responseBodyTransform` property allows you to modify the response body using an FGH expression.
 * It only works with JSON responses and requires the response body to be buffered in memory before processing.
 * The transformation is applied before the response is sent to the client.
 *
 * Example response body transformations:
 *
 * ```js
 * // Add properties to response
 * responseBodyTransform: { fgh: '. + { cached: true, timestamp: .response.headers["date"] }' }
 *
 * // Filter an array response
 * responseBodyTransform: { fgh: 'map(select(.price > 100))' }
 *
 * // Add computed properties
 * responseBodyTransform: { fgh: '. + { total: (.items | map(.price * .quantity) | add) }' }
 * ```
 */
export function createInterceptor (options = {}) {
  process._rawDebug('--------SLICER CREATE NEW INTERCEPTR--------', JSON.stringify(options, null, 2))
  // Default option for cache tags header name
  // Default logger to abstract-logging if not provided
  const { rules, logger: optsLogger, ...routeOptions } = options

  const logger = optsLogger || abstractLogging
  logger.debug('Creating cacheable interceptor with %d rules', rules?.length || 0)

  // Validate rules
  validateRules(rules, logger)

  // Sort rules by specificity
  const sortedRules = sortRulesBySpecificity(rules, logger)

  // Create and configure router
  const router = createRouter(sortedRules, routeOptions, logger)

  // Create and return the interceptor function
  return createInterceptorFunction(router, logger, options)
}

export default createInterceptor
