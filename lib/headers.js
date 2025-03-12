/**
 * Checks if a specific header exists in the raw headers array
 *
 * @param {Array<string>} rawHeaders - Raw headers array
 * @param {string} headerName - Header name to check for
 * @returns {boolean} True if header exists, false otherwise
 */
export function hasHeader (rawHeaders, headerName) {
  const lowerHeaderName = headerName.toLowerCase()
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const currentHeader = String(rawHeaders[i]).toLowerCase()
    if (currentHeader === lowerHeaderName) {
      return true
    }
  }
  return false
}

/**
 * Adds a cache control header to raw headers if one doesn't already exist
 *
 * @param {Array<string>} rawHeaders - Raw headers array
 * @param {string} cacheControl - Cache control value to add
 * @returns {boolean} True if header was added, false otherwise
 */
export function addCacheControlHeader (rawHeaders, cacheControl) {
  if (!hasHeader(rawHeaders, 'cache-control')) {
    rawHeaders.push('cache-control', cacheControl)
    return true
  }
  return false
}

/**
 * Evaluates and adds cache tags header if it doesn't already exist
 *
 * @param {Array<string>} rawHeaders - Raw headers array
 * @param {string} cacheTagsHeader - Name of the cache tags header
 * @param {Function} compiledCacheTag - Compiled fgh expression for cache tags
 * @param {Object} context - Request context for tag evaluation
 * @returns {boolean} True if header was added, false otherwise
 */
export function addCacheTagsHeader (rawHeaders, cacheTagsHeader, compiledCacheTag, context) {
  if (!hasHeader(rawHeaders, cacheTagsHeader)) {
    // Evaluate the tag expression and collect results
    const evaluatedTags = []

    try {
      // Use the pre-compiled fgh expression
      const tagResults = compiledCacheTag(context)

      // Only add non-null, non-undefined tag values
      for (const tag of tagResults) {
        if (tag != null && tag !== '') {
          evaluatedTags.push(String(tag))
        }
      }
    } catch (err) {
      // Skip expression if it fails at runtime
      console.error('Error evaluating cache tag expression', err)
      return false
    }

    // Add the cache tags header if we have any evaluated tags
    if (evaluatedTags.length > 0) {
      rawHeaders.push(cacheTagsHeader, evaluatedTags.join(','))
      return true
    }
  }
  return false
}
