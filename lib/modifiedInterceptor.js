import { createRouter, createRequestContext } from './router.js'
import { compile } from 'fgh'
import { doesRuleRequireResponseAccess } from './responseDetector.js'

/**
 * Creates an interceptor that can handle both request-based and response-based headers.
 * For response-based headers, it uses a special approach that delays adding the headers
 * until the entire response body is available.
 *
 * @param {Object} options - Interceptor options
 * @param {Array} options.rules - Rules for matching routes
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.routeOptions - Options for the router
 * @returns {Function} An interceptor function
 */
export function createUnifiedInterceptor(options) {
  const { rules, logger, ...routeOptions } = options
  
  logger.debug('Creating unified interceptor')
  
  // Create a router for matching routes
  const router = createRouter(rules, routeOptions, logger)
  
  // Pre-process rules to split them into ones that need response body access and ones that don't
  const processedRules = rules.map(rule => {
    const requestOnlyHeaders = {}
    const responseBodyHeaders = {}
    
    // Categorize headers based on whether they need response body access
    if (rule.headers) {
      for (const [headerName, headerValue] of Object.entries(rule.headers)) {
        if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
          const needsResponseBody = headerValue.fgh.includes('.response.body')
          if (needsResponseBody) {
            responseBodyHeaders[headerName] = headerValue
          } else {
            requestOnlyHeaders[headerName] = headerValue
          }
          
          // Ensure the FGH is compiled
          if (!headerValue.compiledFgh) {
            try {
              headerValue.compiledFgh = compile(headerValue.fgh)
            } catch (err) {
              logger.error({
                rule: rule.routeToMatch,
                header: headerName,
                expression: headerValue.fgh,
                error: err.message
              }, 'Error compiling FGH expression')
              throw new Error(`Error compiling FGH expression for header ${headerName}: ${err.message}`)
            }
          }
        } else {
          // Static headers go into the request-only category
          requestOnlyHeaders[headerName] = headerValue
        }
      }
    }
    
    return {
      ...rule,
      requestOnlyHeaders,
      responseBodyHeaders,
      needsResponseBody: Object.keys(responseBodyHeaders).length > 0
    }
  })
  
  return function interceptor(dispatch) {
    logger.debug('Creating unified interceptor function')
    
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
      const routeMatch = router.find(method, path, options)
      if (!routeMatch) {
        logger.debug({ path }, 'No matching route found')
        return dispatch(options, handler)
      }
      
      const matchedRule = processedRules.find(rule => rule.routeToMatch === routeMatch.rule.routeToMatch)
      if (!matchedRule) {
        logger.debug({ path }, 'Matched rule not found in processed rules')
        return dispatch(options, handler)
      }
      
      logger.debug({
        path,
        routeToMatch: matchedRule.routeToMatch,
        needsResponseBody: matchedRule.needsResponseBody
      }, 'Found matching rule')
      
      // Create request context for FGH evaluation
      const requestContext = createRequestContext(routeMatch, options, logger)
      
      // Create a handler wrapper based on whether we need response body access
      const wrappedHandler = matchedRule.needsResponseBody
        ? createResponseBodyHandler(matchedRule, requestContext, handler, logger)
        : createRequestOnlyHandler(matchedRule, requestContext, handler, logger)
      
      return dispatch(options, wrappedHandler)
    }
  }
}

/**
 * Creates a handler wrapper for rules that only require request data
 * 
 * @param {Object} rule - The matched rule
 * @param {Object} context - Request context for FGH evaluation
 * @param {Object} originalHandler - The original request handler
 * @param {Object} logger - Logger instance
 * @returns {Object} Modified handler object
 */
function createRequestOnlyHandler(rule, context, originalHandler, logger) {
  return {
    ...originalHandler,
    
    onHeaders: function(statusCode, rawHeaders, resume, statusMessage) {
      logger.debug({ statusCode }, 'Request-only handler processing headers')
      
      // Add headers that don't require response body
      addHeadersToRawHeaders(rawHeaders, rule.requestOnlyHeaders, context, logger)
      
      // Call the original onHeaders
      return originalHandler.onHeaders
        ? originalHandler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
        : true
    }
  }
}

/**
 * Creates a handler wrapper for rules that require response body access
 * 
 * @param {Object} rule - The matched rule
 * @param {Object} requestContext - Request context for FGH evaluation
 * @param {Object} originalHandler - The original request handler
 * @param {Object} logger - Logger instance
 * @returns {Object} Modified handler object
 */
function createResponseBodyHandler(rule, requestContext, originalHandler, logger) {
  // We'll need to store the response data
  let responseBody = []
  let statusCode
  let rawHeaders
  let resume
  let statusMessage
  
  return {
    // Pass through original methods that we don't modify
    onConnect: originalHandler.onConnect?.bind(originalHandler),
    onError: originalHandler.onError?.bind(originalHandler),
    onUpgrade: originalHandler.onUpgrade?.bind(originalHandler),
    onBodySent: originalHandler.onBodySent?.bind(originalHandler),
    
    // Capture headers but don't resume the response yet
    onHeaders: function(code, headers, resumeFn, message) {
      logger.debug({ statusCode: code }, 'Response body handler capturing headers')
      
      // Store for later use
      statusCode = code
      rawHeaders = headers
      resume = resumeFn
      statusMessage = message
      
      // Add request-only headers right away
      addHeadersToRawHeaders(rawHeaders, rule.requestOnlyHeaders, requestContext, logger)
      
      // Don't resume automatically - we'll do it after collecting the body
      return false
    },
    
    // Collect response body chunks
    onData: function(chunk, next) {
      responseBody.push(chunk)
      next()
    },
    
    // Process the full body when complete
    onComplete: function() {
      try {
        const fullBody = Buffer.concat(responseBody)
        logger.debug({ bodySize: fullBody.length }, 'Response body handler processing complete body')
        
        // Parse the body as JSON
        let bodyJson = null
        try {
          const bodyText = fullBody.toString()
          if (bodyText.length > 0) {
            bodyJson = JSON.parse(bodyText)
            logger.debug('Successfully parsed response body as JSON')
          }
        } catch (err) {
          logger.error({ error: err }, 'Failed to parse response body as JSON')
        }
        
        // Create full context with response body
        const fullContext = {
          ...requestContext,
          response: {
            statusCode,
            headers: (() => {
              const normalizedHeaders = {}
              for (let i = 0; i < rawHeaders.length; i += 2) {
                const key = String(rawHeaders[i]).toLowerCase()
                normalizedHeaders[key] = rawHeaders[i + 1]
              }
              return normalizedHeaders
            })(),
            body: bodyJson
          }
        }
        
        // Add response body headers
        addHeadersToRawHeaders(rawHeaders, rule.responseBodyHeaders, fullContext, logger)
        
        // Now we can call the original onHeaders with our modified headers
        if (originalHandler.onHeaders) {
          originalHandler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
        } else {
          // If no original onHeaders handler, just resume the response
          resume()
        }
        
        // Send the collected body chunks
        for (const chunk of responseBody) {
          if (originalHandler.onData) {
            originalHandler.onData(chunk, () => {})
          }
        }
        
        // Call original onComplete if it exists
        if (originalHandler.onComplete) {
          originalHandler.onComplete()
        }
      } catch (err) {
        logger.error({ error: err }, 'Error in response body handler')
        
        // On error, just pass through to original handler
        if (originalHandler.onHeaders) {
          originalHandler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
        } else {
          resume()
        }
        
        // Send the collected body chunks
        for (const chunk of responseBody) {
          if (originalHandler.onData) {
            originalHandler.onData(chunk, () => {})
          }
        }
        
        // Call original onComplete if it exists
        if (originalHandler.onComplete) {
          originalHandler.onComplete()
        }
      }
    }
  }
}

/**
 * Adds headers to raw headers array
 * 
 * @param {Array} rawHeaders - Raw headers array
 * @param {Object} headers - Headers object with header name and value/FGH
 * @param {Object} context - Context for FGH evaluation
 * @param {Object} logger - Logger instance
 */
function addHeadersToRawHeaders(rawHeaders, headers, context, logger) {
  if (!headers || !context) return
  
  for (const [headerName, headerValue] of Object.entries(headers)) {
    // Skip if the header already exists
    if (hasHeader(rawHeaders, headerName)) {
      logger.debug({ headerName }, 'Header already exists, skipping')
      continue
    }
    
    // Check if it's an FGH expression
    if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
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
            rawHeaders.push(headerName.toLowerCase(), finalValue)
            logger.debug({ headerName, value: finalValue }, 'Added dynamic header')
          }
        }
      } catch (err) {
        logger.error({ 
          error: err, 
          headerName, 
          expression: headerValue.fgh 
        }, 'Error evaluating FGH expression')
      }
    } else {
      // Static header
      rawHeaders.push(headerName.toLowerCase(), headerValue)
      logger.debug({ headerName, value: headerValue }, 'Added static header')
    }
  }
}

/**
 * Checks if a specific header exists in the raw headers array
 *
 * @param {Array<string>} rawHeaders - Raw headers array
 * @param {string} headerName - Header name to check for
 * @returns {boolean} True if header exists, false otherwise
 */
function hasHeader(rawHeaders, headerName) {
  const lowerHeaderName = headerName.toLowerCase()
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const currentHeader = String(rawHeaders[i]).toLowerCase()
    if (currentHeader === lowerHeaderName) {
      return true
    }
  }
  return false
}
