import abstractLogging from 'abstract-logging'

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
 * Checks if a specific header exists in a headers object
 *
 * @param {Object} headers - Headers object
 * @param {string} headerName - Header name to check for
 * @returns {boolean} True if header exists, false otherwise
 */
export function hasHeaderInObject (headers, headerName) {
  const lowerHeaderName = headerName.toLowerCase()
  for (const key in headers) {
    if (key.toLowerCase() === lowerHeaderName) {
      return true
    }
  }
  return false
}

/**
 * Adds multiple headers to raw headers if they don't already exist
 * Supports FGH processing for dynamic header values
 *
 * @param {Array<string>|Object} headersContainer - Raw headers array or headers object
 * @param {Object} headersToAdd - Headers object with header names as keys and values as values or FGH objects
 * @param {Object} [context] - Request context for FGH evaluation
 * @param {Object} [logger] - Logger instance
 * @returns {Array<string>} Array of header names that were added
 */
export function addHeaders (headersContainer, headersToAdd, context = null, logger = abstractLogging) {
  const addedHeaders = []
  const isRawHeaders = Array.isArray(headersContainer)

  for (const [headerName, headerValue] of Object.entries(headersToAdd)) {
    // Check if the header already exists based on container type
    const headerExists = isRawHeaders
      ? hasHeader(headersContainer, headerName)
      : hasHeaderInObject(headersContainer, headerName)

    // Skip if the header already exists in the response
    if (headerExists) {
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

              // Add header based on container type
              if (isRawHeaders) {
                headersContainer.push(headerName.toLowerCase(), finalValue)
              } else {
                headersContainer[headerName.toLowerCase()] = finalValue
              }

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
      if (isRawHeaders) {
        headersContainer.push(headerName.toLowerCase(), headerValue)
      } else {
        headersContainer[headerName.toLowerCase()] = headerValue
      }

      addedHeaders.push(headerName)
      logger.debug({ context, headerName, value: headerValue }, 'Added static header')
    }
  }

  return addedHeaders
}
