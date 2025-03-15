import { addHeaders } from './headers.js'
import { createRequestContext } from './router.js'

/**
 * Creates the handler wrapper that adds proxy methods to capture and modify the response
 *
 * @param {Object} options - Request options
 * @param {Object} handler - Original request handler
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Object} Modified handler object
 */
export function createResponseHandlerWrapper (options, handler, router, logger) {
  // Get the path from options
  const path = options.path || ''
  const method = options.method ? options.method.toUpperCase() : 'GET'

  logger.debug({ path, method }, 'Response interceptor processing request')

  // Find matching route
  const result = router.find('GET', path, options)
  const matchingRule = result ? result.rule : null

  if (!matchingRule) {
    logger.debug({ path, method }, 'No matching route found for request in response interceptor')
    return handler
  }

  logger.debug({
    path,
    method,
    routeToMatch: matchingRule.routeToMatch
  }, 'Found matching route for request in response interceptor')

  // Only intercept GET or HEAD requests
  if (method !== 'GET' && method !== 'HEAD') {
    logger.debug({ method }, 'Response interceptor skipping non-GET/HEAD request')
    return handler
  }

  // Store the request context for later use
  const requestContext = createRequestContext(result, options, logger)

  // Create a proxy object with the original handler methods
  const proxy = {
    // Store collected response body chunks here
    body: [],

    // Original handler methods
    onConnect: function (abort) {
      logger.debug('Interceptor: onConnect')
      return handler.onConnect && handler.onConnect(abort)
    },

    onError: function (error) {
      logger.debug({ error }, 'Interceptor: onError')
      return handler.onError && handler.onError(error)
    },

    onUpgrade: function (statusCode, headers, socket) {
      logger.debug({ statusCode }, 'Interceptor: onUpgrade')
      return handler.onUpgrade && handler.onUpgrade(statusCode, headers, socket)
    },

    // Handle the response headers - this is called first for normal responses
    onHeaders: function (statusCode, headers, resume, statusText) {
      logger.debug({ statusCode }, 'Interceptor: onHeaders')

      // For headers that only require request data (not response body), add them now
      if (matchingRule && matchingRule.headers) {
        for (const [headerName, headerValue] of Object.entries(matchingRule.headers)) {
          // Skip if the header already exists
          if (hasHeader(headers, headerName)) {
            continue
          }

          // Add the header
          if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
            try {
              const compiledFgh = headerValue.compiledFgh
              if (compiledFgh) {
                const results = compiledFgh(requestContext)
                const filteredResults = results
                  .filter(result => result != null && result !== '')
                  .map(result => String(result))

                if (filteredResults.length > 0) {
                  const finalValue = filteredResults.join(',')
                  headers.push(headerName.toLowerCase(), finalValue)
                  logger.debug({ headerName, finalValue }, 'Added request-only based header')
                }
              }
            } catch (err) {
              logger.error({ headerName, error: err }, 'Error evaluating request-only FGH expression')
            }
          } else {
            // Static header
            headers.push(headerName.toLowerCase(), headerValue)
            logger.debug({ headerName, value: headerValue }, 'Added static header')
          }
        }
      }

      // Let the original handler process the headers
      return handler.onHeaders && handler.onHeaders(statusCode, headers, resume, statusText)
    },

    // Collect the response body
    onData: function (chunk, next) {
      logger.debug({ chunkLength: chunk.length }, 'Interceptor: onData')

      // Save the chunk for later processing
      proxy.body.push(chunk)

      // Let the original handler process the data
      return handler.onData && handler.onData(chunk, next)
    },

    // Handle completion - here we can modify the response headers based on the body
    onComplete: function (trailers) {
      logger.debug('Interceptor: onComplete')

      // Pass to original handler
      return handler.onComplete && handler.onComplete(trailers)
    },

    onBodySent: function (error) {
      logger.debug({ error }, 'Interceptor: onBodySent')
      return handler.onBodySent && handler.onBodySent(error)
    }
  }

  return proxy
}

/**
 * Checks if a specific header exists in the raw headers array
 *
 * @param {Array<string>} rawHeaders - Raw headers array
 * @param {string} headerName - Header name to check for
 * @returns {boolean} True if header exists, false otherwise
 */
function hasHeader (rawHeaders, headerName) {
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
 * Creates an interceptor function that processes responses
 *
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Function} Interceptor function
 */
export function createResponseInterceptorFunction (router, logger) {
  return function responseInterceptor (dispatch) {
    logger.debug('Created response-aware interceptor function')

    return function responseDispatch (options, handler) {
      // Create a wrapper to modify the handler
      const wrappedHandler = createResponseHandlerWrapper(options, handler, router, logger)

      // Call the original dispatch with the wrapped handler
      return dispatch(options, wrappedHandler)
    }
  }
}
