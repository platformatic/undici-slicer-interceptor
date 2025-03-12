/**
 * Validates the provided rules for the cacheable interceptor
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} rules - Rules for cache control
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
    if (!rule.cacheControl || typeof rule.cacheControl !== 'string') {
      throw new Error('Each rule must have a cacheControl string')
    }
  }
}

/**
 * Sorts rules by path length (longest first) for prioritizing specific paths
 *
 * @param {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} rules - Rules for cache control
 * @returns {Array<{routeToMatch: string, cacheControl: string, cacheTags?: string}>} Sorted rules
 */
export function sortRulesBySpecificity (rules) {
  return [...rules].sort((a, b) =>
    b.routeToMatch.length - a.routeToMatch.length
  )
}
