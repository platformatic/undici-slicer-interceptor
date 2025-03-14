import { validateRules, sortRulesBySpecificity } from './lib/validator.js'
import { createSimpleInterceptor } from './lib/simpleInterceptor.js'
import { createUnifiedInterceptor } from './lib/modifiedInterceptor.js'
import { doesRuleRequireResponseAccess } from './lib/responseDetector.js'
import abstractLogging from 'abstract-logging'

/**
 * Creates an undici interceptor that adds headers based on specified rules.
 * The interceptor uses a router to match the request path and applies the corresponding
 * headers to the response, but only for GET and HEAD requests, and only if
 * those headers don't already exist. It can also add cache tags headers and any other
 * dynamic headers based on jq-style rules implemented via fgh.
 *
 * Supports two types of dynamic headers:
 * 1. Request-based headers: Generated from request data like params, querystring, and headers
 * 2. Response-based headers: Generated from response body data
 *
 * @param {Object} options - Options for the interceptor
 * @param {Array<{routeToMatch: string, headers?: Object}>} options.rules - Array of rules for headers
 * @param {string} options.rules[].routeToMatch - Origin and path pattern to match in format "hostname:port/path" or "hostname/path"
 * @param {Object} [options.rules[].headers] - Object containing headers to set. Values can be strings for static headers
 * (e.g., {"cache-control": "public, max-age=3600"}) or objects with an fgh property for dynamic headers based on
 * request context (e.g., {"x-cache-tags": { fgh: "'user', 'user-' + .params.userId" }})
 *
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
 * const interceptor = createInterceptor({
 *   rules: [
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
 *       routeToMatch: 'localhost:3042/products/:id',
 *       headers: {
 *         'cache-control': 'public, max-age=3600',
 *         'x-cache-tags': { fgh: "'product-' + .response.body.id" }
 *       }
 *     }
 *   ],
 *   ignoreTrailingSlash: true,
 *   caseSensitive: false
 * })
 *
 * // This will add headers to GET and HEAD requests that don't already
 * // have those headers. Dynamic headers can use jq-style expressions
 * // to generate values based on request context or response body.
 * const composedAgent = agent.compose(interceptor)
 * setGlobalDispatcher(composedAgent)
 * ```
 */
export function createInterceptor (options = {}) {
  // Extract options
  const { rules = [], logger: optsLogger, ...routeOptions } = options
  
  // Default logger to abstract-logging if not provided
  const logger = optsLogger || abstractLogging
  logger.debug(`Creating cacheable interceptor with ${rules.length} rules`)
  
  // Validate that rules is an array
  if (!Array.isArray(rules)) {
    logger.error('Invalid rules format: not an array')
    throw new Error('Rules must be an array')
  }

  // Validate rules
  validateRules(rules, logger)

  // Sort rules by specificity
  const sortedRules = sortRulesBySpecificity(rules, logger)
  
  // Check if any rules require response body access
  let needsResponseInterceptor = false
  for (const rule of sortedRules) {
    if (doesRuleRequireResponseAccess(rule.headers)) {
      needsResponseInterceptor = true
      logger.debug({ rule: rule.routeToMatch }, 'Found rule requiring response access')
      break
    }
  }
  
  // Select appropriate interceptor based on presence of response-based headers
  if (needsResponseInterceptor) {
    logger.debug('Using unified interceptor that can handle response body access')
    return createUnifiedInterceptor({
      rules: sortedRules,
      logger,
      ...routeOptions
    })
  } else {
    logger.debug('Using simple interceptor for request-only headers')
    return createSimpleInterceptor({
      rules: sortedRules,
      logger,
      ...routeOptions
    })
  }
}

export default createInterceptor
