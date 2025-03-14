import { addHeaders } from './headers.js'
import { createRequestContext } from './router.js'

/**
 * Creates the handler wrapper that modifies response headers
 *
 * @param {Object} options - Request options
 * @param {Object} handler - Original request handler
 * @param {Object} router - Configured router
 * @param {string} cacheTagsHeader - Name of the cache tags header
 * @returns {Object} Modified handler object
 */
export function createHandlerWrapper (options, handler, router, cacheTagsHeader) {
  // Get the path from options
  const path = options.path || ''

  // Find matching route - pass the entire path and options to router.find
  // The router will handle matching by path and also verify the origin matches
  const result = router.find('GET', path, options)
  const matchingRule = result ? result.rule : null

  // Prepare request context for tag evaluation if we have a matching rule
  const context = matchingRule ? createRequestContext(result, options) : null

  return {
    // Pass through original handler methods
    onConnect: handler.onConnect?.bind(handler),
    onError: handler.onError?.bind(handler),
    onUpgrade: handler.onUpgrade?.bind(handler),

    // Intercept onHeaders to modify headers
    onHeaders: function (statusCode, rawHeaders, resume, statusMessage) {
      // Only modify headers if we have a matching rule and it's a GET or HEAD request
      const method = options.method ? options.method.toUpperCase() : 'GET'
      if (matchingRule && (method === 'GET' || method === 'HEAD')) {
        // Handle headers object with context for FGH evaluation
        if (matchingRule.headers) {
          addHeaders(rawHeaders, matchingRule.headers, context)
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
 * Creates the interceptor function that wraps the dispatch
 *
 * @param {Object} router - Configured router
 * @param {string} cacheTagsHeader - Name of the cache tags header
 * @returns {Function} Interceptor function
 */
export function createInterceptorFunction (router, cacheTagsHeader) {
  return function cachingInterceptor (dispatch) {
    return function cachedDispatch (options, handler) {
      return dispatch(
        options,
        createHandlerWrapper(options, handler, router, cacheTagsHeader)
      )
    }
  }
}
