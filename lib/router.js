import findMyWay from 'find-my-way'
import { compile } from 'fgh'
import { extractOrigin } from './extractOrigin.js'
import abstractLogging from 'abstract-logging'
import { hasResponseAccess } from './hasResponseAccess.js'

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
  // Check if the route has a protocol
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

  return {
    origin: cleanOrigin,
    path
  }
}

/**
 * Creates router(s) configured with the provided rules and options
 *
 * @param {Array<{routeToMatch: string, headers?: Object, responseBodyTransform?: Object}>} rules - Rules for cache control
 * @param {Object} options - Router options
 * @param {Object} [logger] - Logger instance
 * @returns {Object} Configured router object with per-origin routers
 */
export function createRouter (rules, options, logger = abstractLogging) {
  // Add some logging
  logger.debug('Creating router for cacheable interceptor')

  // Group rules by origin
  const rulesByOrigin = new Map()

  // Process rules and organize them by origin
  for (const rule of rules) {
    // Parse the route to extract origin and path
    const routeInfo = parseRouteWithOrigin(rule.routeToMatch)

    // Store the origin with the rule
    rule.origin = routeInfo.origin
    rule.path = routeInfo.path

    // Flag to determine if this rule needs response body access
    rule.needsResponseBodyAccess = false

    // Pre-compile FGH expressions in headers if present
    if (rule.headers) {
      // Flag to determine if this rule needs response body access
      rule.needsResponseBodyAccess = false

      for (const [headerName, headerValue] of Object.entries(rule.headers)) {
        if (headerValue && typeof headerValue === 'object' && headerValue.fgh && typeof headerValue.fgh === 'string') {
          try {
            // Store the compiled expression in the header value object
            headerValue.compiledFgh = compile(headerValue.fgh)

            // Check if the expression accesses the response body
            if (hasResponseAccess(headerValue.fgh)) {
              rule.needsResponseBodyAccess = true
              logger.debug({
                header: headerName,
                expression: headerValue.fgh,
                rule: rule.routeToMatch
              }, 'Found header that accesses response body')
            }

            logger.debug({
              header: headerName,
              expression: headerValue.fgh,
              rule: rule.routeToMatch,
              needsResponseBody: rule.needsResponseBodyAccess
            }, 'Compiled FGH expression')
          } catch (err) {
            logger.error({
              header: headerName,
              expression: headerValue.fgh,
              rule: rule.routeToMatch,
              error: err.message
            }, 'Error compiling FGH expression')
            throw new Error(`Error compiling FGH expression for header ${headerName}: ${headerValue.fgh}. ${err.message}`)
          }
        }
      }
    }

    // Pre-compile FGH expressions in responseBodyTransform if present
    if (rule.responseBodyTransform) {
      // Mark that this rule needs response body access
      rule.needsResponseBodyAccess = true

      if (rule.responseBodyTransform.fgh && typeof rule.responseBodyTransform.fgh === 'string') {
        try {
          // Store the compiled expression in the responseBodyTransform object
          rule.responseBodyTransform.compiledFgh = compile(rule.responseBodyTransform.fgh)

          logger.debug({
            expression: rule.responseBodyTransform.fgh,
            rule: rule.routeToMatch
          }, 'Compiled responseBodyTransform FGH expression')
        } catch (err) {
          logger.error({
            expression: rule.responseBodyTransform.fgh,
            rule: rule.routeToMatch,
            error: err.message
          }, 'Error compiling responseBodyTransform FGH expression')
          throw new Error(`Error compiling responseBodyTransform FGH expression: ${rule.responseBodyTransform.fgh}. ${err.message}`)
        }
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

    // Store rules by path within this origin
    const pathMap = new Map()

    logger.debug({ origin }, 'Creating router for origin')

    for (const rule of originRules) {
      // Check if we already have a rule for this path and throw an error if so
      if (pathMap.has(rule.path)) {
        const existingRule = pathMap.get(rule.path)
        logger.error({
          path: rule.path,
          origin: rule.origin,
          existingRule: existingRule.routeToMatch,
          conflictingRule: rule.routeToMatch
        }, 'Multiple rules for the same path')
        throw new Error(`Multiple rules for the same path: '${rule.path}' for origin '${rule.origin}'. First rule: '${existingRule.routeToMatch}', conflicting rule: '${rule.routeToMatch}'`)
      }

      // Store the rule directly (not in an array)
      pathMap.set(rule.path, rule)
    }

    // Register each unique path with its single rule
    for (const [path, rule] of pathMap.entries()) {
      router.on('GET', path, () => ({ rule }))
      logger.debug({ path, origin, routeToMatch: rule.routeToMatch }, 'Registered route')
    }

    // Store the router for this origin
    routers.set(origin, router)
    logger.debug({ origin, routeCount: pathMap.size }, 'Router configured for origin')
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
      // Get the request origin
      const requestOrigin = extractOrigin(options)

      logger.debug({ method, path, requestOrigin }, 'Searching for matching route')

      // Check if we have a router for this origin
      const router = routers.get(requestOrigin)

      if (!router) {
        logger.debug({ requestOrigin }, 'No router found for origin')
        return null
      }

      // Find matching routes for this path in the origin-specific router
      const result = router.find(method, path)

      if (!result) {
        logger.debug({ method, path, requestOrigin }, 'No matching route found')
        return null
      }

      // Get the rule for this path
      const { rule } = result.handler()

      logger.debug({
        method,
        path,
        requestOrigin,
        matchedRoute: rule.routeToMatch
      }, 'Found matching route')

      // Add the rule to the result
      const matchResult = { ...result }
      matchResult.rule = rule
      return matchResult
    }
  }
}

/**
 * Creates a request context object from route result and request options
 *
 * @param {Object} result - find-my-way route result
 * @param {Object} options - Request options
 * @param {Object} [logger] - Logger instance
 * @returns {Object} Context object for cache tag evaluation
 */
export function createRequestContext (result, options = {}, logger = abstractLogging) {
  const path = options.path || ''

  logger.debug({ path }, 'Creating request context for cache tag evaluation')

  const context = {
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

  if (logger.isLevelEnabled && logger.isLevelEnabled('trace')) {
    logger.trace({
      context: JSON.stringify(context),
      params: JSON.stringify(context.params),
      querystring: JSON.stringify(context.querystring)
    }, 'Created request context')
  } else {
    logger.debug('Request context created')
  }

  return context
}
