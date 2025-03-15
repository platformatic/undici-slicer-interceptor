import { addHeaders } from './headers.js'
import { createRequestContext } from './router.js'
import { WrapHandler } from './wrap-handler.js'
import { ResponseBuffer } from './responseBuffer.js'
import { hasResponseAccess } from './hasResponseAccess.js'

/**
 * Creates a controller-based handler that modifies response headers
 * This version only processes request-based headers
 *
 * @param {Object} options - Request options
 * @param {Object} originalHandler - Original request handler (controller-based)
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Object} Modified handler object
 */
export function createRequestOnlyHandler(options, originalHandler, router, logger) {
  // Get the path from options
  const path = options.path || ''
  const method = options.method ? options.method.toUpperCase() : 'GET'

  logger.debug({ path, method }, 'Request-only interceptor processing request')

  // Find matching route - pass the entire path and options to router.find
  // The router will handle matching by path and also verify the origin matches
  const result = router.find('GET', path, options)
  const matchingRule = result ? result.rule : null

  if (matchingRule) {
    logger.debug({
      path,
      method,
      routeToMatch: matchingRule.routeToMatch
    }, 'Found matching route for request')
  } else {
    logger.debug({ path, method }, 'No matching route found for request')
  }

  // Prepare request context for tag evaluation if we have a matching rule
  const context = matchingRule ? createRequestContext(result, options, logger) : null

  return {
    onRequestStart(controller, requestContext) {
      // Pass the request start to the original handler
      originalHandler.onRequestStart(controller, requestContext)
    },

    onResponseStart(controller, statusCode, headers, statusMessage) {
      // Only modify headers if we have a matching rule and it's a GET or HEAD request
      if (matchingRule && (method === 'GET' || method === 'HEAD')) {
        logger.debug({
          statusCode,
          method,
          path
        }, 'Processing response headers')

        // Handle headers object with context for FGH evaluation
        if (matchingRule.headers) {
          logger.debug({
            path,
            method,
            routeToMatch: matchingRule.routeToMatch
          }, 'Adding cache headers to response')

          // Add headers directly to the headers object
          addHeaders(headers, matchingRule.headers, context, logger)
        }
      }

      // Pass to the original handler with the modified headers
      originalHandler.onResponseStart(controller, statusCode, headers, statusMessage)
    },

    onResponseData(controller, chunk) {
      originalHandler.onResponseData(controller, chunk)
    },

    onResponseEnd(controller, trailers) {
      originalHandler.onResponseEnd(controller, trailers)
    },

    onResponseError(controller, error) {
      originalHandler.onResponseError(controller, error)
    }
  }
}

/**
 * Creates a controller-based handler that buffers the response body
 * and processes response-based headers
 *
 * @param {Object} options - Request options
 * @param {Object} originalHandler - Original request handler (controller-based)
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Object} Modified handler object
 */
export function createResponseAwareHandler(options, originalHandler, router, logger) {
  // Get the path from options
  const path = options.path || ''
  const method = options.method ? options.method.toUpperCase() : 'GET'

  logger.debug({ path, method }, 'Response-aware interceptor processing request')

  // Find matching route - pass the entire path and options to router.find
  const result = router.find('GET', path, options)
  const matchingRule = result ? result.rule : null

  if (!matchingRule) {
    logger.debug({ path, method }, 'No matching route found for request')
    return originalHandler // Return original handler if no rule matches
  }

  logger.debug({
    path,
    method,
    routeToMatch: matchingRule.routeToMatch
  }, 'Found matching route for request')

  // Prepare request context for tag evaluation if we have a matching rule
  const context = createRequestContext(result, options, logger)
  
  // Create response buffer for collecting response body chunks
  const responseBuffer = new ResponseBuffer()
  
  // Flag to track if this is a GET or HEAD request
  const isGetOrHead = method === 'GET' || method === 'HEAD'

  // Store the original response information
  let originalResponseHeaders = null
  let originalResponseController = null
  let originalStatusCode = null
  let originalStatusMessage = null
  
  // Flag to track if we've passed the response to the original handler
  let responsePassed = false

  return {
    onRequestStart(controller, requestContext) {
      // Pass the request start to the original handler
      originalHandler.onRequestStart(controller, requestContext)
    },

    onResponseStart(controller, statusCode, headers, statusMessage) {
      // Save original response information for later use
      originalResponseHeaders = headers
      originalResponseController = controller
      originalStatusCode = statusCode
      originalStatusMessage = statusMessage
      
      // Clear the buffer for a new response
      responseBuffer.clear()
      
      // For non-200 responses or non-GET/HEAD requests, process request-based headers and pass through
      if (statusCode !== 200 || !isGetOrHead || !matchingRule.needsResponseBodyAccess) {
        // Only modify headers if we have a matching rule and it's a GET or HEAD request
        if (matchingRule && isGetOrHead) {
          logger.debug({
            statusCode,
            method,
            path
          }, 'Processing request-based headers only')

          // Add request-based headers
          // Only add headers that don't access the response
          // Create a filtered context without response
          const requestContext = { ...context };
          for (const [headerName, headerValue] of Object.entries(matchingRule.headers)) {
            if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
              if (!hasResponseAccess(headerValue.fgh)) {
                addHeaders(headers, { [headerName]: headerValue }, context, logger);
              }
            } else {
              // Static headers
              headers[headerName.toLowerCase()] = headerValue;
            }
          }
        }

        // Pass to the original handler
        originalHandler.onResponseStart(controller, statusCode, headers, statusMessage)
        responsePassed = true
      } else {
        // For 200 responses that need body access, don't pass to original handler yet
        logger.debug({
          statusCode,
          method,
          path
        }, 'Buffering response for header processing')
        
        // Don't set responsePassed flag
      }
    },

    onResponseData(controller, chunk) {
      // Add chunk to our buffer if we're processing the body
      if (originalStatusCode === 200 && isGetOrHead && matchingRule.needsResponseBodyAccess && !responsePassed) {
        responseBuffer.addChunk(chunk)
      }
      
      // Only pass to the original handler if we've already passed the response
      if (responsePassed) {
        originalHandler.onResponseData(controller, chunk)
      }
    },

    onResponseEnd(controller, trailers) {
      // If we haven't passed the response yet, process the body and pass it now
      if (!responsePassed && originalResponseController && originalResponseHeaders) {
        try {
          // Try to parse the response body as JSON
          const responseBody = responseBuffer.getBodyAsJson()
          
          logger.debug({
            method,
            path,
            routeToMatch: matchingRule.routeToMatch
          }, 'Processing response body-based headers')
          
          // Create context with the response body
          const contextWithResponse = {
            ...context,
            response: {
              body: responseBody,
              statusCode: originalStatusCode
            }
          }
          
          // Create a copy of the original headers
          const newHeaders = { ...originalResponseHeaders }
          
          // Add our headers with the response context
          addHeaders(newHeaders, matchingRule.headers, contextWithResponse, logger)
          
          // Now pass the response to the original handler
          originalHandler.onResponseStart(
            originalResponseController, 
            originalStatusCode, 
            newHeaders, 
            originalStatusMessage
          )
          
          // Pass all buffered data
          const body = responseBuffer.getBody()
          if (body) {
            const bodyBuffer = Buffer.from(body)
            originalHandler.onResponseData(originalResponseController, bodyBuffer)
          }
        } catch (err) {
          logger.error({
            method,
            path,
            error: err.message
          }, 'Error processing response body-based headers')
          
          // If there was an error, pass the original response
          originalHandler.onResponseStart(
            originalResponseController, 
            originalStatusCode, 
            originalResponseHeaders, 
            originalStatusMessage
          )
          
          // Pass the buffered data to best effort
          try {
            const body = responseBuffer.getBody()
            if (body) {
              const bodyBuffer = Buffer.from(body)
              originalHandler.onResponseData(originalResponseController, bodyBuffer)
            }
          } catch (bodyErr) {
            logger.error({
              method,
              path,
              error: bodyErr.message
            }, 'Error passing buffered response body')
          }
        }
      }
      
      // Always pass the response end
      originalHandler.onResponseEnd(controller, trailers)
    },

    onResponseError(controller, error) {
      originalHandler.onResponseError(controller, error)
    }
  }
}

/**
 * Determines if a rule needs response body access
 * 
 * @param {Object} rule - Rule configuration
 * @param {Object} logger - Logger instance
 * @returns {boolean} True if rule needs response body access
 */
function doesRuleNeedResponseBodyAccess(rule, logger) {
  // The rule should already have this flag set during routing setup
  if (rule && rule.needsResponseBodyAccess === true) {
    logger.debug({
      routeToMatch: rule.routeToMatch,
    }, 'Rule needs response body access')
    return true
  }
  
  return false
}

/**
 * Creates a controller-based handler that modifies response headers
 * Automatically selects the appropriate handler based on whether
 * response body access is needed
 *
 * @param {Object} options - Request options
 * @param {Object} originalHandler - Original request handler (controller-based)
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Object} Modified handler object
 */
export function createControllerHandler(options, originalHandler, router, logger) {
  // Get the path from options
  const path = options.path || ''
  const method = options.method ? options.method.toUpperCase() : 'GET'

  // Find matching route
  const result = router.find('GET', path, options)
  const matchingRule = result ? result.rule : null

  // Check if we need response body access
  if (matchingRule && doesRuleNeedResponseBodyAccess(matchingRule, logger)) {
    logger.debug({
      path,
      method,
      routeToMatch: matchingRule.routeToMatch
    }, 'Using response-aware handler for request')
    return createResponseAwareHandler(options, originalHandler, router, logger)
  } else {
    logger.debug({
      path,
      method,
      routeToMatch: matchingRule ? matchingRule.routeToMatch : null
    }, 'Using request-only handler for request')
    return createRequestOnlyHandler(options, originalHandler, router, logger)
  }
}

/**
 * Creates the interceptor function that wraps the dispatch
 *
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Function} Interceptor function
 */
export function createInterceptorFunction(router, logger) {
  return function cachingInterceptor(dispatch) {
    logger.debug('Created cacheable interceptor function')

    return function cachedDispatch(options, handler) {
      // Always use the controller-based interface
      // If the handler is using the legacy interface, wrap it with WrapHandler
      const controllerHandler = handler.onRequestStart
        ? handler
        : new WrapHandler(handler)

      // Create a handler that adds the headers using the controller interface
      const wrappedHandler = createControllerHandler(options, controllerHandler, router, logger)

      return dispatch(options, wrappedHandler)
    }
  }
}
