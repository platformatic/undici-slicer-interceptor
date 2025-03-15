import abstractLogging from 'abstract-logging'

/**
 * Transforms a response body using an FGH expression
 *
 * @param {Object} responseBody - Response body to transform
 * @param {Object} rule - Rule configuration with responseBodyTransform
 * @param {Object} context - Request context
 * @param {Object} logger - Logger instance
 * @returns {Object} Transformed response body
 */
export function transformResponseBody (responseBody, rule, context, logger = abstractLogging) {
  if (!rule || !rule.responseBodyTransform || !rule.responseBodyTransform.compiledFgh) {
    return responseBody
  }

  try {
    const compiledFgh = rule.responseBodyTransform.compiledFgh
    
    // Log detailed debug information
    logger.debug({
      fghExpression: rule.responseBodyTransform.fgh,
      context: typeof context === 'object' ? 'OBJECT' : 'NOT OBJECT',
      params: context.params ? JSON.stringify(context.params) : 'null',
      querystring: context.querystring ? JSON.stringify(context.querystring) : 'null',
      responseBodyKeys: responseBody ? Object.keys(responseBody) : 'none'
    }, 'Executing FGH transform')
    
    // Execute the FGH expression with the context properly
    // Use a wrapper to provide FGH with context that includes the params and querystring
    logger.debug({
      params: context.params,
      querystring: context.querystring
    }, 'Using context for transform')
    
    const transformContext = {
      ...responseBody,
      params: context.params || {},
      querystring: context.querystring || {},
      response: context.response || {}
    }
    
    // Execute the transformation
    const transformedResults = compiledFgh(transformContext)
    
    // If the transformation returned no results, return the original body
    if (!transformedResults || transformedResults.length === 0) {
      logger.warn({ rule: rule.routeToMatch }, 'FGH transformation returned empty results, using original body')
      return responseBody
    }
    
    // Return the first result of the transformation
    return transformedResults[0]
  } catch (err) {
    logger.error({ 
      rule: rule.routeToMatch, 
      error: err.message,
      stack: err.stack
    }, 'Error transforming response body')
    // Return original body on error instead of throwing
    return responseBody
  }
}
