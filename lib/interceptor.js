import { addHeaders } from './headers.js'
import { createRequestContext } from './router.js'
import { WrapHandler } from './wrap-handler.js'

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
        }
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
 * Creates a controller-based handler that modifies response headers
 *
 * @param {Object} options - Request options
 * @param {Object} originalHandler - Original request handler (controller-based)
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Object} Modified handler object
 */
export function createControllerHandler (options, originalHandler, router, logger) {
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
    onRequestStart (controller, requestContext) {
      // Pass the request start to the original handler
      originalHandler.onRequestStart(controller, requestContext)
    },

    onResponseStart (controller, statusCode, headers, statusMessage) {
      // Only modify headers if we have a matching rule and it's a GET or HEAD request
      if (matchingRule && (method === 'GET' || method === 'HEAD')) {
        // Convert headers object to rawHeaders format for addHeaders
        const rawHeaders = []
        for (const [key, val] of Object.entries(headers)) {
          rawHeaders.push(Buffer.from(key), Buffer.from(val))
        }

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
          
          addHeaders(rawHeaders, matchingRule.headers, context, logger)
          
          // Convert rawHeaders back to object format
          // Clear existing headers first
          for (const key in headers) {
            delete headers[key]
          }
          
          // Add updated headers back
          for (let i = 0; i < rawHeaders.length; i += 2) {
            const key = rawHeaders[i].toString()
            const value = rawHeaders[i + 1].toString()
            headers[key] = value
          }
        }
      }

      // Pass to the original handler with possibly modified headers
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
 * Creates the interceptor function that wraps the dispatch
 *
 * @param {Object} router - Configured router
 * @param {Object} logger - Logger instance
 * @returns {Function} Interceptor function
 */
export function createInterceptorFunction (router, logger) {
  return function cachingInterceptor (dispatch) {
    logger.debug('Created cacheable interceptor function')
    
    return function cachedDispatch (options, handler) {
      if (handler.onRequestStart) {
        // This is a controller-based handler, create a controller handler wrapper
        const controllerHandler = createControllerHandler(options, handler, router, logger)
        return dispatch(options, controllerHandler)
      } else {
        // This is a legacy handler, use the legacy wrapper
        const legacyWrapper = createHandlerWrapper(options, handler, router, logger)
        return dispatch(options, legacyWrapper)
      }
    }
  }
}
