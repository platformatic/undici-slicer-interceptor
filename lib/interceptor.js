import { addHeaders } from './headers.js'
import { createRequestContext } from './router.js'
import { WrapHandler } from './wrap-handler.js'
import { BufferList } from 'bl'
import { hasResponseAccess } from './hasResponseAccess.js'
import { transformResponseBody } from './transformResponseBody.js'

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
export function createRequestOnlyHandler (options, originalHandler, ctx) {
  // Get the path from options
  const path = options.path || ''
  const method = options.method ? options.method.toUpperCase() : 'GET'

  const router = ctx.getRouter()
  const logger = ctx.getLogger()

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
    onRequestStart (controller, requestContext) {
      // Pass the request start to the original handler
      originalHandler.onRequestStart(controller, requestContext)
    },

    onResponseStart (controller, statusCode, headers, statusMessage) {
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

    onResponseData (controller, chunk) {
      originalHandler.onResponseData(controller, chunk)
    },

    onResponseEnd (controller, trailers) {
      originalHandler.onResponseEnd(controller, trailers)
    },

    onResponseError (controller, error) {
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
export function createResponseAwareHandler (options, originalHandler, ctx) {
  // Get the path from options
  const path = options.path || ''
  const method = options.method ? options.method.toUpperCase() : 'GET'

  const router = ctx.getRouter()
  const logger = ctx.getLogger()

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

  // Create buffer list for collecting response body chunks
  const bl = new BufferList()

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
    onRequestStart (controller, requestContext) {
      // Pass the request start to the original handler
      originalHandler.onRequestStart(controller, requestContext)
    },

    onResponseStart (controller, statusCode, headers, statusMessage) {
      // Save original response information for later use
      originalResponseHeaders = headers
      originalResponseController = controller
      originalStatusCode = statusCode
      originalStatusMessage = statusMessage

      // Reset the buffer list for a new response
      bl.consume(bl.length)

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
          // Process headers based on context
          for (const [headerName, headerValue] of Object.entries(matchingRule.headers)) {
            if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
              if (!hasResponseAccess(headerValue.fgh)) {
                addHeaders(headers, { [headerName]: headerValue }, context, logger)
              }
            } else {
              // Static headers
              headers[headerName.toLowerCase()] = headerValue
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

    onResponseData (controller, chunk) {
      // Add chunk to our buffer if we're processing the body
      if (originalStatusCode === 200 && isGetOrHead && matchingRule.needsResponseBodyAccess && !responsePassed) {
        bl.append(chunk)
      }

      // Only pass to the original handler if we've already passed the response
      if (responsePassed) {
        originalHandler.onResponseData(controller, chunk)
      }
    },

    onResponseEnd (controller, trailers) {
      // If we haven't passed the response yet, process the body and pass it now
      if (!responsePassed && originalResponseController && originalResponseHeaders) {
        try {
          // Try to parse the response body as JSON only if content-type includes application/json
          const bodyString = bl.toString('utf8')
          let responseBody = null
          let transformedBody = null

          // Check if content-type header includes application/json
          const contentType = originalResponseHeaders['content-type'] || ''

          if (contentType.includes('application/json')) {
            try {
              responseBody = JSON.parse(bodyString)

              // Apply response body transformation if configured
              if (matchingRule.responseBodyTransform && responseBody !== null) {
                logger.debug({
                  method,
                  path,
                  routeToMatch: matchingRule.routeToMatch
                }, 'Transforming response body with FGH')

                // Create a complete context for transformation including params, querystring, etc.
                // but making them available at the top level as well as in context
                const contextWithResponse = {
                  ...context,
                  // Make params and querystring available at the top level for convenient access
                  params: context.params || {},
                  querystring: context.querystring || {},
                  response: {
                    body: responseBody,
                    statusCode: originalStatusCode,
                    headers: originalResponseHeaders
                  }
                }

                // Log context information
                logger.debug({
                  path,
                  method,
                  params: context.params,
                  'context.params': JSON.stringify(context.params),
                  'context.querystring': JSON.stringify(context.querystring),
                  responseBody: (typeof responseBody === 'object') ? 'OBJECT' : 'NOT OBJECT'
                }, 'Context debug for response body transformation')

                // transformResponseBody now handles errors internally and returns the original body on error
                transformedBody = transformResponseBody(responseBody, matchingRule, contextWithResponse, logger)
                responseBody = transformedBody // Update responseBody with transformed version

                if (transformedBody === responseBody) {
                  logger.debug({
                    method,
                    path,
                    routeToMatch: matchingRule.routeToMatch
                  }, 'No changes from body transformation, using original')
                } else {
                  logger.debug({
                    method,
                    path,
                    routeToMatch: matchingRule.routeToMatch
                  }, 'Successfully transformed response body')
                }
              }
            } catch (parseError) {
              logger.error({
                method,
                path,
                error: parseError.message
              }, 'Error parsing response as JSON')
            }
          } else {
            logger.debug({
              method,
              path,
              contentType
            }, 'Skipping JSON parsing for non-JSON content-type')
          }

          logger.debug({
            method,
            path,
            routeToMatch: matchingRule.routeToMatch
          }, 'Processing response body-based headers')

          // Create a copy of the original headers
          const newHeaders = { ...originalResponseHeaders }

          // Process request-based headers even if JSON parsing failed
          for (const [headerName, headerValue] of Object.entries(matchingRule.headers)) {
            if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
              if (!hasResponseAccess(headerValue.fgh)) {
                // Only add headers that don't access the response
                addHeaders(newHeaders, { [headerName]: headerValue }, context, logger)
              } else if (responseBody !== null) {
                // Only add response-based headers if we have a valid JSON body
                // Create a complete context for response headers
                const contextWithResponse = {
                  ...context,
                  // Make params and querystring available at the top level for consistency
                  params: context.params || {},
                  querystring: context.querystring || {},
                  response: {
                    body: responseBody,
                    statusCode: originalStatusCode,
                    headers: originalResponseHeaders
                  }
                }

                // Log the context for debugging
                logger.debug({ contextWithResponse }, 'Context for response body-based headers')

                addHeaders(newHeaders, { [headerName]: headerValue }, contextWithResponse, logger)
              }
            } else {
              // Static headers
              newHeaders[headerName.toLowerCase()] = headerValue
            }
          }

          // Now pass the response to the original handler
          originalHandler.onResponseStart(
            originalResponseController,
            originalStatusCode,
            newHeaders,
            originalStatusMessage
          )

          // Pass transformed body if there is one, otherwise pass the original buffered data
          if (transformedBody && contentType && contentType.includes('application/json')) {
            try {
            // Convert transformed body back to JSON string
              const transformedBodyString = JSON.stringify(transformedBody)

              // Update Content-Length header if it exists
              if ('content-length' in newHeaders) {
                newHeaders['content-length'] = String(Buffer.byteLength(transformedBodyString))
              }

              // Pass the transformed body
              originalHandler.onResponseData(originalResponseController, Buffer.from(transformedBodyString))
            } catch (err) {
              logger.error({
                method,
                path,
                error: err.message
              }, 'Error sending transformed response body, falling back to original')

              // Fall back to original body on error
              if (bl.length > 0) {
                originalHandler.onResponseData(originalResponseController, bl.slice())
              }
            }
          } else if (bl.length > 0) {
            // Pass the original buffered data
            originalHandler.onResponseData(originalResponseController, bl.slice())
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

          // Pass the buffered data as best effort
          try {
            if (bl.length > 0) {
              originalHandler.onResponseData(originalResponseController, bl.slice())
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

    onResponseError (controller, error) {
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
function doesRuleNeedResponseBodyAccess (rule, logger) {
  // The rule should already have this flag set during routing setup
  if (rule && (rule.needsResponseBodyAccess === true || rule.responseBodyTransform)) {
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
export function createControllerHandler (options, originalHandler, ctx) {
  // Get the path from options
  const path = options.path || ''
  const method = options.method ? options.method.toUpperCase() : 'GET'

  const router = ctx.getRouter()
  const logger = ctx.getLogger()

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
    return createResponseAwareHandler(options, originalHandler, ctx)
  } else {
    logger.debug({
      path,
      method,
      routeToMatch: matchingRule ? matchingRule.routeToMatch : null
    }, 'Using request-only handler for request')
    return createRequestOnlyHandler(options, originalHandler, ctx)
  }
}

/**
 * Creates the interceptor function that wraps the dispatch
 *
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Function} Interceptor function
 */
export function createInterceptorFunction (ctx) {
  return function slicerInterceptor (dispatch) {
    const logger = ctx.getLogger()
    logger.debug('Created slicer interceptor function')

    return function slicerDispatch (options, handler) {
      // Always use the controller-based interface
      // If the handler is using the legacy interface, wrap it with WrapHandler
      const controllerHandler = handler.onRequestStart
        ? handler
        : new WrapHandler(handler)

      // Create a handler that adds the headers using the controller interface
      const wrappedHandler = createControllerHandler(options, controllerHandler, ctx)

      return dispatch(options, wrappedHandler)
    }
  }
}
