import { parse } from 'fgh'

// Simple regex-based detection for quick checks before AST parsing
const responseAccessRegex = /\.response\b/

/**
 * Checks if an AST node or its children access the 'response' property
 * 
 * @param {Object} ast - The AST node to check
 * @returns {boolean} True if the AST accesses .response, false otherwise
 */
function checkIfAST_AccessesResponse(ast) {
  // Handle null/undefined or non-object nodes
  if (!ast || typeof ast !== 'object') {
    return false
  }
  
  // If this is a MemberExpression with property access on 'response'
  if (ast.type === 'MemberExpression') {
    // Check for .response pattern
    // The actual structure depends on the AST format returned by fgh.parse()
    if (ast.property === 'response') {
      return true
    }
    
    // If the left side is an identity and the property is 'response'
    if (ast.object && ast.object.type === 'Identity' && 
        ast.property === 'response') {
      return true
    }
  }
  
  // Check nested objects
  for (const key in ast) {
    if (ast[key] && typeof ast[key] === 'object') {
      if (checkIfAST_AccessesResponse(ast[key])) {
        return true
      }
    }
  }
  
  // Check arrays
  if (Array.isArray(ast)) {
    for (const item of ast) {
      if (checkIfAST_AccessesResponse(item)) {
        return true
      }
    }
  }
  
  return false
}

/**
 * Determines if an FGH expression accesses the response object
 * 
 * @param {string} fghExpression - The FGH expression to check
 * @returns {boolean} True if the expression accesses .response, false otherwise
 */
export function doesExpressionAccessResponse(fghExpression) {
  // First do a quick regex check
  if (responseAccessRegex.test(fghExpression)) {
    return true
  }
  
  // For complex cases, parse the AST
  try {
    const ast = parse(fghExpression)
    return checkIfAST_AccessesResponse(ast)
  } catch (err) {
    // If parsing fails, fall back to regex check
    return responseAccessRegex.test(fghExpression)
  }
}

/**
 * Checks if any header in a rule requires response access
 * 
 * @param {Object} headers - The headers object from a rule
 * @returns {boolean} True if any header requires response access, false otherwise
 */
export function doesRuleRequireResponseAccess(headers) {
  if (!headers || typeof headers !== 'object') {
    return false
  }

  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerValue && typeof headerValue === 'object' && headerValue.fgh) {
      const needsResponse = doesExpressionAccessResponse(headerValue.fgh)
      if (needsResponse) {
        return true
      }
    }
  }

  return false
}
