import abstractLogging from 'abstract-logging'

/**
 * Checks if a specific header exists in a headers object
 *
 * @param {Object} headers - Headers object
 * @param {string} headerName - Header name to check for
 * @returns {boolean} True if header exists, false otherwise
 */
export function hasHeader (headers, headerName) {
  const lowerHeaderName = headerName.toLowerCase()
  for (const key in headers) {
    if (key.toLowerCase() === lowerHeaderName) {
      return true
    }
  }
  return false
}

/**
 * Adds multiple headers to a headers object if they don't already exist
 * Supports FGH processing for dynamic header values
 *
 * @param {Object} headers - Headers object to modify
 * @param {Object} headersToAdd - Headers object with header names as keys and values as values or FGH objects
 * @param {Object} [context] - Request context for FGH evaluation
 * @param {Object} [logger] - Logger instance
 * @returns {Array<string>} Array of header names that were added
 */
export function addHeaders (headers, headersToAdd, context = null, logger = abstractLogging) {
  const addedHeaders = []

  for (const [headerName, headerValue] of Object.entries(headersToAdd)) {
    // Skip if the header already exists in the response
    if (hasHeader(headers, headerName)) {
      logger.debug({ headerName }, 'Header already exists, skipping')
      continue
    }

    // Check if headerValue is an FGH object
    if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
      if (context) {
        try {
          // Use the pre-compiled FGH expression
          const compiledFgh = headerValue.compiledFgh
          if (compiledFgh) {
            // Evaluate the expression
            const results = compiledFgh(context)

            // Filter out null/undefined/empty values
            const filteredResults = results.filter(result => result != null && result !== '')
              .map(result => String(result))

            if (filteredResults.length > 0) {
              // Join multiple results if there are any
              const finalValue = filteredResults.join(',')
              headers[headerName.toLowerCase()] = finalValue
              addedHeaders.push(headerName)

              logger.debug({ context, headerName, value: finalValue }, 'Added dynamic header from FGH expression')
            }
          }
        } catch (err) {
          logger.error({ context, headerName, err }, 'Error evaluating FGH for header')
          // Skip this header if FGH evaluation fails
        }
      }
    } else {
      // Process as a regular header
      headers[headerName.toLowerCase()] = headerValue
      addedHeaders.push(headerName)

      logger.debug({ context, headerName, value: headerValue }, 'Added static header')
    }
  }

  return addedHeaders
}
