// Load fgh to look at parse
import { parse } from 'fgh';

try {
  // Test parsing a regular expression
  const regularExpression = ".params.userId";
  const regularAst = parse(regularExpression);
  console.log("Regular expression AST:", JSON.stringify(regularAst, null, 2));

  // Test parsing an expression that accesses response
  const responseExpression = "'.product-' + .response.body[].id";
  const responseAst = parse(responseExpression);
  console.log("Response expression AST:", JSON.stringify(responseAst, null, 2));

  // Function to check if an AST node accesses .response
  function hasResponseAccess(node) {
    if (!node) return false;

    // Check if this is a property access to .response
    if (
      node.type === 'PropertyAccess' && 
      node.property === 'response'
    ) {
      return true;
    }

    // Recursively check all properties that might contain child nodes
    for (const key in node) {
      if (node[key] && typeof node[key] === 'object') {
        if (hasResponseAccess(node[key])) {
          return true;
        }
      }
    }

    return false;
  }

  console.log("Regular expression has response access:", hasResponseAccess(regularAst));
  console.log("Response expression has response access:", hasResponseAccess(responseAst));
} catch (error) {
  console.error("Parse error:", error);
}
