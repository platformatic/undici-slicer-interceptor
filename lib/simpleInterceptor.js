import { createRouter, createRequestContext } from './router.js'
import { doesRuleRequireResponseAccess } from './responseDetector.js'

/**
 * Creates an interceptor function that adds headers based on request data.
 * For now, this implementation only supports request-based headers.
 * 
 * @param {Object} options - Options for the interceptor
 * @param {Array} options.rules - Array of rules to match routes
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.routeOptions - Options for the router
 * @returns {Function} - Interceptor function
 */
export function createSimpleInterceptor(options) {
  const { rules, logger, ...routeOptions } = options
  
  logger.debug('Creating simple interceptor')
  
  // Create a router for matching routes
  const router = createRouter(rules, routeOptions, logger)
  
  // Create interceptor function
  return function interceptor(dispatch) {
    logger.debug('Creating simple interceptor function')
    
    return function interceptorDispatch(options, handler) {
      const method = options.method ? options.method.toUpperCase() : 'GET'
      const path = options.path || ''
      
      logger.debug({ method, path }, 'Interceptor processing request')
      
      // Only process GET and HEAD requests
      if (method !== 'GET' && method !== 'HEAD') {
        logger.debug({ method }, 'Skipping non-GET/HEAD request')
        return dispatch(options, handler)
      }
      
      // Find the matching rule
      const result = router.find(method, path, options)
      if (!result || !result.rule) {
        logger.debug({ path }, 'No matching route found')
        return dispatch(options, handler)
      }
      
      const matchingRule = result.rule
      logger.debug({ 
        path, 
        rule: matchingRule.routeToMatch 
      }, 'Found matching rule')
      
      // Create request context for header evaluation
      const context = createRequestContext(result, options, logger)
      
      // Ensure the method is part of the request context
      context.method = method
      
      // Create a new handler that adds the headers
      const newHandler = {
        // Preserve the original handler methods
        onConnect: handler.onConnect?.bind(handler),
        onError: handler.onError?.bind(handler),
        onUpgrade: handler.onUpgrade?.bind(handler),
        onData: handler.onData?.bind(handler),
        onComplete: handler.onComplete?.bind(handler),
        onBodySent: handler.onBodySent?.bind(handler),
        
        // Intercept onHeaders to add our headers
        onHeaders: function(statusCode, rawHeaders, resume, statusMessage) {
          logger.debug({ statusCode }, 'Processing response headers')
          
          // Add headers from the rule
          if (matchingRule.headers) {
            for (const [headerName, headerValue] of Object.entries(matchingRule.headers)) {
              // Skip if the header already exists
              if (hasHeader(rawHeaders, headerName)) {
                logger.debug({ headerName }, 'Header already exists, skipping')
                continue
              }
              
              // Skip headers that need response body access
              if (headerValue && typeof headerValue === 'object' && 
                  headerValue.fgh && headerValue.fgh.includes('.response')) {
                logger.debug({ headerName }, 'Skipping response-based header')
                continue
              }
              
              // Add the header
              try {
                if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
                  // Dynamic header with FGH
                  const compiledFgh = headerValue.compiledFgh
                  if (compiledFgh) {
                    const results = compiledFgh(context)
                    const filteredResults = results
                      .filter(result => result != null && result !== '')
                      .map(result => String(result))
                    
                    if (filteredResults.length > 0) {
                      const finalValue = filteredResults.join(',')
                      rawHeaders.push(headerName.toLowerCase(), finalValue)
                      logger.debug({ headerName, value: finalValue }, 'Added dynamic header')
                    }
                  }
                } else {
                  // Static header
                  rawHeaders.push(headerName.toLowerCase(), headerValue)
                  logger.debug({ headerName, value: headerValue }, 'Added static header')
                }
              } catch (err) {
                logger.error({ 
                  error: err,
                  headerName
                }, 'Error adding header')
              }
            }
          }
          
          // Call the original onHeaders method
          return handler.onHeaders ? 
            handler.onHeaders(statusCode, rawHeaders, resume, statusMessage) : 
            true
        }
      }
      
      // Dispatch with our new handler
      return dispatch(options, newHandler)
    }
  }
}

/**
 * Checks if a header exists in raw headers
 * 
 * @param {Array} rawHeaders - Raw headers array
 * @param {string} headerName - Header name to check
 * @returns {boolean} - True if header exists
 */
function hasHeader(rawHeaders, headerName) {
  const normalizedName = headerName.toLowerCase()
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (String(rawHeaders[i]).toLowerCase() === normalizedName) {
      return true
    }
  }
  return false
}
