import { parseRouteWithOrigin } from './router.js'

/**
 * Validates the provided rules for the cacheable interceptor
 *
 * @param {Array<{routeToMatch: string, headers?: Object, cacheControl?: string, cacheTags?: string}>} rules - Rules for cache control
 * @throws {Error} If rules are invalid
 */
export function validateRules (rules) {
  // Validate rules
  if (!Array.isArray(rules)) {
    throw new Error('Rules must be an array')
  }

  // Validate each rule
  for (const rule of rules) {
    if (!rule.routeToMatch || typeof rule.routeToMatch !== 'string') {
      throw new Error('Each rule must have a routeToMatch string')
    }

    // Check if the route has a valid format with origin included
    if (rule.routeToMatch.startsWith('/')) {
      throw new Error(`Invalid route format in rule: ${rule.routeToMatch}. Origin must be specified at the beginning of the route (e.g., 'example.com/path' or 'http://example.com/path')`)
    }

    try {
      // Verify the route can be parsed with origin
      parseRouteWithOrigin(rule.routeToMatch)
    } catch (err) {
      throw new Error(`Invalid route format in rule: ${rule.routeToMatch}. ${err.message}`)
    }

    // Check for backwards compatibility - either headers or cacheControl must be provided
    if ((!rule.headers || typeof rule.headers !== 'object') && 
        (!rule.cacheControl || typeof rule.cacheControl !== 'string')) {
      throw new Error('Each rule must have either a headers object or a cacheControl string')
    }

    // If both are provided, cacheControl takes precedence for backward compatibility
    if (rule.headers && rule.cacheControl) {
      // We allow this but log a warning in development
      if (process.env.NODE_ENV === 'development') {
        console.warn('Both headers and cacheControl provided in rule. The cacheControl value will take precedence.')
      }
    }
  }
}

/**
 * Sorts rules by path length (longest first) for prioritizing specific paths
 *
 * @param {Array<{routeToMatch: string, headers?: Object, cacheControl?: string, cacheTags?: string}>} rules - Rules for cache control
 * @returns {Array<{routeToMatch: string, headers?: Object, cacheControl?: string, cacheTags?: string}>} Sorted rules
 */
export function sortRulesBySpecificity (rules) {
  return [...rules].sort((a, b) => {
    // Parse the routes to get just the path parts
    const { path: pathA } = parseRouteWithOrigin(a.routeToMatch)
    const { path: pathB } = parseRouteWithOrigin(b.routeToMatch)

    // Sort by path length
    return pathB.length - pathA.length
  })
}
