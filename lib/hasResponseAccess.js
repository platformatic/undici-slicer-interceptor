import { parse } from 'fgh'

/**
 * Checks if an FGH expression accesses the .response property
 *
 * @param {string} expression - The FGH expression to check
 * @returns {boolean} True if the expression accesses .response, false otherwise
 */
export function hasResponseAccess (expression) {
  if (!expression || typeof expression !== 'string') {
    return false
  }

  try {
    const ast = parse(expression)
    return checkNodeForResponseAccess(ast)
  } catch (error) {
    // If we can't parse the expression, assume it doesn't access response
    return false
  }
}

/**
 * Recursively checks an AST node and its children for .response access
 *
 * @param {Object} node - The AST node to check
 * @returns {boolean} True if the node or any of its children access .response
 */
function checkNodeForResponseAccess (node) {
  if (!node || typeof node !== 'object') {
    return false
  }

  // Check if this is a property access to .response
  if (
    node.type === 'PropertyAccess' &&
    node.property === 'response'
  ) {
    return true
  }

  // Recursively check all properties that might contain child nodes
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      if (checkNodeForResponseAccess(node[key])) {
        return true
      }
    }
  }

  return false
}
