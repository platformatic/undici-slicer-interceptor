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

    // For debugging - show what's available in context
    logger.debug({
      params: context.params ? JSON.stringify(context.params) : 'undefined',
      querystring: context.querystring ? JSON.stringify(context.querystring) : 'undefined'
    }, 'Context params for FGH transform')

    // Create input object that has both the response body properties
    // and also provides access to params and querystring
    const transformInput = {
      ...responseBody,
      __context: context,
      params: context.params || {},
      querystring: context.querystring || {}
    }

    // Execute transformation with the combined input
    const transformedResults = compiledFgh(transformInput)

    // If the transformation returned no results, return the original body
    if (!transformedResults || transformedResults.length === 0) {
      logger.warn({ rule: rule.routeToMatch }, 'FGH transformation returned empty results, using original body')
      return responseBody
    }

    // Return the first result of the transformation
    return transformedResults[0]
  } catch (err) {
    logger.error({ rule: rule.routeToMatch, error: err.message }, 'Error transforming response body')
    // Return original body on error instead of throwing
    return responseBody
  }
}
