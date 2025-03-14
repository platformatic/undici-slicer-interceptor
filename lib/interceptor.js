import { addHeaders } from './headers.js'
import { createRequestContext } from './router.js'

/**
 * Creates the handler wrapper that modifies response headers
 *
 * @param {Object} options - Request options
 * @param {Object} handler - Original request handler
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Object} Modified handler object
 */
export function createHandlerWrapper (options, handler, router, logger) {
  // Get the path from options
  const path = options.path || ''
  const method = options.method ? options.method.toUpperCase() : 'GET'

  logger.debug({ path, method }, 'Interceptor processing request')

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
    // Pass through original handler methods
    onConnect: handler.onConnect?.bind(handler),
    onError: handler.onError?.bind(handler),
    onUpgrade: handler.onUpgrade?.bind(handler),

    // Intercept onHeaders to modify headers
    onHeaders: function (statusCode, rawHeaders, resume, statusMessage) {
      // Only modify headers if we have a matching rule and it's a GET or HEAD request
      const method = options.method ? options.method.toUpperCase() : 'GET'
      
      logger.debug({ 
        statusCode,
        method,
        path
      }, 'Processing response headers')
      
      if (matchingRule && (method === 'GET' || method === 'HEAD')) {
        // Handle headers object with context for FGH evaluation
        if (matchingRule.headers) {
          logger.debug({
            path,
            method,
            routeToMatch: matchingRule.routeToMatch
          }, 'Adding cache headers to response')
          
          addHeaders(rawHeaders, matchingRule.headers, context, logger)
          
          logger.debug('Headers added to response')
        }
      } else if (matchingRule) {
        logger.debug(`Not adding headers for ${method} request (only GET and HEAD supported)`)
      }

      // Call the original handler with the modified headers
      return handler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
    },

    // Pass through other handler methods
    onData: handler.onData?.bind(handler),
    onComplete: handler.onComplete?.bind(handler),
    onBodySent: handler.onBodySent?.bind(handler)
  }
}

/**
 * Creates the interceptor function that wraps the dispatch
 *
 * @param {Object} router - Configured router
 * @returns {Function} Interceptor function
 */
export function createInterceptorFunction (router, logger) {
  return function cachingInterceptor (dispatch) {
    logger.debug('Created cacheable interceptor function')
    return function cachedDispatch (options, handler) {
      return dispatch(
        options,
        createHandlerWrapper(options, handler, router, logger)
      )
    }
  }
}
