import { parseRouteWithOrigin } from './router.js'
import abstractLogging from 'abstract-logging'

/**
 * Validates the provided rules for the cacheable interceptor
 *
 * @param {Array<{routeToMatch: string, headers?: Object}>} rules - Rules for cache control
 * @param {Object} [logger] - Logger instance
 * @throws {Error} If rules are invalid
 */
export function validateRules (rules, logger = abstractLogging) {
  // Validate rules
  if (!Array.isArray(rules)) {
    logger.error('Invalid rules format: not an array')
    throw new Error('Rules must be an array')
  }
  
  logger.debug(`Validating ${rules.length} rules`)

  // Validate each rule
  for (const rule of rules) {
    if (!rule.routeToMatch || typeof rule.routeToMatch !== 'string') {
      logger.error('Invalid rule: missing routeToMatch string')
      throw new Error('Each rule must have a routeToMatch string')
    }

    // Check if the route has a valid format with origin included
    if (rule.routeToMatch.startsWith('/')) {
      logger.error({ route: rule.routeToMatch }, 'Invalid route format: missing origin')
      throw new Error(`Invalid route format in rule: ${rule.routeToMatch}. Origin must be specified at the beginning of the route (e.g., 'example.com/path' or 'http://example.com/path')`)
    }

    try {
      // Verify the route can be parsed with origin
      parseRouteWithOrigin(rule.routeToMatch)
      logger.debug({ route: rule.routeToMatch }, 'Valid route format')
    } catch (err) {
      logger.error({ route: rule.routeToMatch, error: err.message }, 'Invalid route format')
      throw new Error(`Invalid route format in rule: ${rule.routeToMatch}. ${err.message}`)
    }

    // Headers must be provided
    if (!rule.headers || typeof rule.headers !== 'object') {
      logger.error({ route: rule.routeToMatch }, 'Invalid rule: missing headers object')
      throw new Error('Each rule must have a headers object')
    }

    // Validate FGH expressions in headers if present
    for (const [headerName, headerValue] of Object.entries(rule.headers)) {
      if (headerValue && typeof headerValue === 'object') {
        if (headerValue.fgh) {
          if (typeof headerValue.fgh !== 'string') {
            logger.error({ header: headerName, route: rule.routeToMatch }, 'Invalid FGH expression: not a string')
            throw new Error(`Invalid FGH expression in header ${headerName}: must be a string`)
          }
          logger.debug({ header: headerName, route: rule.routeToMatch }, 'Valid FGH expression')
        } else {
          logger.error({ header: headerName, route: rule.routeToMatch }, 'Invalid header value: missing fgh property')
          throw new Error(`Invalid header value for ${headerName}: must have an fgh property if it's an object`)
        }
      }
    }
  }
}

/**
 * Sorts rules by path length (longest first) for prioritizing specific paths
 *
 * @param {Array<{routeToMatch: string, headers?: Object}>} rules - Rules for cache control
 * @param {Object} [logger] - Logger instance
 * @returns {Array<{routeToMatch: string, headers?: Object}>} Sorted rules
 */
export function sortRulesBySpecificity (rules, logger = abstractLogging) {
  logger.debug('Sorting rules by specificity (path length)')
  
  const sortedRules = [...rules].sort((a, b) => {
    // Parse the routes to get just the path parts
    const { path: pathA } = parseRouteWithOrigin(a.routeToMatch)
    const { path: pathB } = parseRouteWithOrigin(b.routeToMatch)

    // Sort by path length
    return pathB.length - pathA.length
  })
  
  // Log the sorted rules in debug mode
  sortedRules.forEach((rule, index) => {
    const { path } = parseRouteWithOrigin(rule.routeToMatch)
    logger.debug({ index, path, routeToMatch: rule.routeToMatch }, 'Sorted rule')
  })
  
  return sortedRules
}
