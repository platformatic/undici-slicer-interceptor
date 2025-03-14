import { createRouter, createRequestContext } from './router.js'
import { doesExpressionAccessResponse } from './responseDetector.js'
import { hasHeader } from './headers.js'
import { compile } from 'fgh'

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
          const needsResponseBody = doesExpressionAccessResponse(headerValue.fgh)
          if (needsResponseBody) {
            responseBodyHeaders[headerName] = headerValue
            logger.debug({ 
              rule: rule.routeToMatch, 
              header: headerName, 
              expression: headerValue.fgh 
            }, 'Response-based header detected')
          } else {
            requestOnlyHeaders[headerName] = headerValue
            logger.debug({ 
              rule: rule.routeToMatch, 
              header: headerName, 
              expression: headerValue.fgh 
            }, 'Request-only header detected')
          }
        } else {
          // Static headers go into the request-only category
          requestOnlyHeaders[headerName] = headerValue
          logger.debug({ 
            rule: rule.routeToMatch, 
            header: headerName 
          }, 'Static header detected')
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
      if (!routeMatch || !routeMatch.rule) {
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

      // Ensure the method is part of the request context
      requestContext.method = method

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
    // Preserve original handlers
    onConnect: originalHandler.onConnect?.bind(originalHandler),
    onError: originalHandler.onError?.bind(originalHandler),
    onUpgrade: originalHandler.onUpgrade?.bind(originalHandler),
    onData: originalHandler.onData?.bind(originalHandler),
    onComplete: originalHandler.onComplete?.bind(originalHandler),
    onBodySent: originalHandler.onBodySent?.bind(originalHandler),
    
    // Handle headers - this is where we add our request-based headers
    onHeaders: function(statusCode, rawHeaders, resume, statusMessage) {
      logger.debug({ statusCode }, 'Processing response headers')
      
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
  logger.debug('Creating response body handler')
  // We'll need to store the response data
  let responseBody = []
  let statusCode
  let rawHeaders
  let resume
  let statusMessage
  let headersSent = false
  
  return {
    // Pass through original methods that we don't modify
    onConnect: originalHandler.onConnect?.bind(originalHandler),
    onError: originalHandler.onError?.bind(originalHandler),
    onUpgrade: originalHandler.onUpgrade?.bind(originalHandler),
    onBodySent: originalHandler.onBodySent?.bind(originalHandler),
    
    // Capture headers but don't resume the response yet
    onHeaders: function(code, headers, resumeFn, message) {
      logger.debug({ statusCode: code }, 'Capturing response headers')
      
      // Store for later use
      statusCode = code
      rawHeaders = headers
      resume = resumeFn
      statusMessage = message
      
      // Add request-only headers right away
      addHeadersToRawHeaders(rawHeaders, rule.requestOnlyHeaders, requestContext, logger)
      
      // For HEAD requests, we don't expect any body, so process response immediately
      if (requestContext && requestContext.method === 'HEAD') {
        logger.debug('HEAD request detected, processing response immediately')
        // Create empty response context
        const fullContext = {
          ...requestContext,
          response: {
            statusCode,
            headers: normalizeHeaders(rawHeaders),
            body: null
          }
        }
        
        // Add response-based headers with null body
        addHeadersToRawHeaders(rawHeaders, rule.responseBodyHeaders, fullContext, logger)
        headersSent = true
        return originalHandler.onHeaders ? 
          originalHandler.onHeaders(statusCode, rawHeaders, resume, statusMessage) : 
          true
      }
      
      // We continue, so we can collect the body
      return true
    },
    
    // Collect response body chunks
    onData: function(chunk) {
      logger.debug({ chunkLength: chunk.length }, 'Collecting response body chunk')
      
      // Save the chunk for later processing
      responseBody.push(chunk)
      
      // We don't pass the data to the original handler yet
      return true
    },
    
    // Process the full body when complete
    onComplete: function(trailers) {
      try {
        // If headers were already sent (in case of error or early completion), just pass through
        if (headersSent) {
          logger.debug('Headers already sent, skipping response processing')
          if (originalHandler.onComplete) {
            return originalHandler.onComplete(trailers)
          }
          return
        }
        
        // Combine all chunks into a single buffer
        const fullBody = Buffer.concat(responseBody)
        logger.debug({ bodySize: fullBody.length }, 'Processing complete response body')
        
        // Parse the body as JSON if possible
        let bodyJson = null
        try {
          const bodyText = fullBody.toString()
          if (bodyText.trim().length > 0) {
            bodyJson = JSON.parse(bodyText)
            logger.debug('Successfully parsed response body as JSON')
          } else {
            logger.debug('Empty response body')
          }
        } catch (err) {
          logger.error({ error: err.message }, 'Failed to parse response body as JSON')
          // Even if parsing fails, we still want to provide the body text
          bodyJson = fullBody.toString()
        }
        
        // Create full context with response body
        const fullContext = {
          ...requestContext,
          response: {
            statusCode,
            headers: normalizeHeaders(rawHeaders),
            body: bodyJson
          }
        }
        
        // Manually apply response body headers to ensure they're added correctly
        if (rule.responseBodyHeaders) {
          for (const [headerName, headerValue] of Object.entries(rule.responseBodyHeaders)) {
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
                  try {
                    // Evaluate the expression
                    logger.debug({ headerName, expression }, 'Evaluating FGH expression with compiled function')
                    const results = compiledFgh(fullContext)
                    
                    // Process results
                    if (Array.isArray(results)) {
                      const filteredResults = results
                        .filter(result => result != null && result !== '')
                        .map(result => String(result))
                      
                      if (filteredResults.length > 0) {
                        // Join multiple results if there are any
                        const finalValue = filteredResults.join(',')
                        rawHeaders.push(headerName.toLowerCase(), finalValue)
                        logger.debug({ headerName, value: finalValue }, 'Added dynamic header from compiled FGH')
                      }
                    } else if (results != null && results !== '') {
                      // Single non-array result
                      rawHeaders.push(headerName.toLowerCase(), String(results))
                      logger.debug({ headerName, value: String(results) }, 'Added dynamic header (single value) from compiled FGH')
                    }
                  } catch (err) {
                    logger.error({ 
                      error: err,
                      headerName, 
                      expression
                    }, 'Error evaluating compiled FGH expression')
                  }
                } else {
                  // Try to compile on the fly
                  try {
                    logger.debug({ headerName, expression }, 'Compiling FGH expression on the fly')
                    const freshCompiledFgh = compile(expression)
                    const results = freshCompiledFgh(fullContext)
                    
                    // Same processing logic as above
                    if (Array.isArray(results)) {
                      const filteredResults = results
                        .filter(result => result != null && result !== '')
                        .map(result => String(result))
                      
                      if (filteredResults.length > 0) {
                        const finalValue = filteredResults.join(',')
                        rawHeaders.push(headerName.toLowerCase(), finalValue)
                        logger.debug({ headerName, value: finalValue }, 'Added dynamic header from fresh-compiled FGH')
                      }
                    } else if (results != null && results !== '') {
                      rawHeaders.push(headerName.toLowerCase(), String(results))
                      logger.debug({ headerName, value: String(results) }, 'Added dynamic header (single value) from fresh-compiled FGH')
                    }
                  } catch (err) {
                    logger.error({ 
                      error: err,
                      headerName, 
                      expression
                    }, 'Error compiling/evaluating FGH expression on the fly')
                  }
                }
              } catch (err) {
                logger.error({ 
                  error: err,
                  headerName, 
                  expression: headerValue.fgh
                }, 'Error processing FGH header')
              }
            } else {
              // Static header
              rawHeaders.push(headerName.toLowerCase(), headerValue)
              logger.debug({ headerName, value: headerValue }, 'Added static header')
            }
          }
        }
        
        // Now we can resume the response with our modified headers
        headersSent = true
        
        // First call onHeaders to send headers
        if (originalHandler.onHeaders) {
          logger.debug('Calling original onHeaders with modified headers')
          originalHandler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
        } else {
          logger.debug('No original onHeaders handler, resuming response')
          resume()
        }
        
        // Send all the collected body chunks through the original onData handler
        for (const chunk of responseBody) {
          if (originalHandler.onData) {
            originalHandler.onData(chunk)
          }
        }
        
        // Call original onComplete if it exists
        if (originalHandler.onComplete) {
          logger.debug('Calling original onComplete')
          return originalHandler.onComplete(trailers)
        }
      } catch (err) {
        logger.error({ error: err }, 'Error in response body handler')
        
        // On error, just pass through to original handler without further modifications
        if (!headersSent) {
          headersSent = true
          if (originalHandler.onHeaders) {
            originalHandler.onHeaders(statusCode, rawHeaders, resume, statusMessage)
          } else {
            resume()
          }
          
          // Send the collected body chunks
          for (const chunk of responseBody) {
            if (originalHandler.onData) {
              originalHandler.onData(chunk)
            }
          }
        }
        
        // Call original onComplete if it exists
        if (originalHandler.onComplete) {
          return originalHandler.onComplete(trailers)
        }
      }
    }
  }
}

/**
 * Normalizes raw headers into an object
 * 
 * @param {Array} rawHeaders - Array of header names and values
 * @returns {Object} - Object with normalized header names and values
 */
function normalizeHeaders(rawHeaders) {
  const normalizedHeaders = {}
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const key = String(rawHeaders[i]).toLowerCase()
    normalizedHeaders[key] = rawHeaders[i + 1]
  }
  return normalizedHeaders
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
          logger.debug({ headerName, expression: headerValue.fgh }, 'Evaluating FGH expression')
          
          // Evaluate the expression
          const results = compiledFgh(context)
          
          // Handle all possible result types
          let processedResults = []
          
          if (Array.isArray(results)) {
            // If the result is already an array, use it as-is
            processedResults = results
              .filter(result => result != null && result !== '')
              .map(result => String(result))
          } else if (results != null && results !== '') {
            // Single value (not array) - just use it as a single-item array
            processedResults = [String(results)]
          }
          
          if (processedResults.length > 0) {
            // Join multiple results if there are any
            const finalValue = processedResults.join(',')
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
