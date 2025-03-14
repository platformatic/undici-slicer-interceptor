// Import compile from fgh at the module level
import { compile } from 'fgh'

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
 * Adds multiple headers to raw headers if they don't already exist
 * Supports FGH processing for dynamic header values
 *
 * @param {Array<string>} rawHeaders - Raw headers array
 * @param {Object} headers - Headers object with header names as keys and values as values or FGH objects
 * @param {Object} [context] - Request context for FGH evaluation
 * @returns {Array<string>} Array of header names that were added
 */
export function addHeaders (rawHeaders, headers, context = null) {
  const addedHeaders = []

  for (const [headerName, headerValue] of Object.entries(headers)) {
    // Skip if the header already exists in the response
    if (hasHeader(rawHeaders, headerName)) {
      continue
    }

    // Check if headerValue is an FGH object
    if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
      if (context) {
        try {
          // Evaluate FGH expression from the header value
          const { compiledFgh, fghResults } = evaluateFghExpression(headerValue.fgh, context)
          if (compiledFgh && fghResults.length > 0) {
            // Join multiple results if there are any
            const finalValue = fghResults.join(',')
            rawHeaders.push(headerName.toLowerCase(), finalValue)
            addedHeaders.push(headerName)
          }
        } catch (err) {
          // Skip this header if FGH evaluation fails
          console.error(`Error evaluating FGH for header ${headerName}:`, err)
        }
      }
    } else {
      // Process as a regular header
      rawHeaders.push(headerName.toLowerCase(), headerValue)
      addedHeaders.push(headerName)
    }
  }

  return addedHeaders
}

/**
 * Helper function to evaluate an FGH expression
 *
 * @param {string} fghExpression - FGH expression string
 * @param {Object} context - Request context for tag evaluation
 * @returns {Object} Object containing compiled expression and results
 */
export function evaluateFghExpression (fghExpression, context) {
  // Compile the FGH expression
  const compiledFgh = compile(fghExpression)

  // Evaluate the expression and collect results
  const fghResults = []
  const rawResults = compiledFgh(context)

  // Process results, filtering out null/undefined/empty values
  for (const result of rawResults) {
    if (result != null && result !== '') {
      fghResults.push(String(result))
    }
  }

  return { compiledFgh, fghResults }
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
