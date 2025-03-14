# @platformatic/slicer-interceptor

A library that creates an Undici interceptor to automatically add headers to responses based on URL routing patterns using [find-my-way](https://github.com/delvedor/find-my-way).

## Installation

```bash
npm install @platformatic/slicer-interceptor
```

## Features

- Automatically adds headers to HTTP responses based on URL patterns
- Supports defining multiple headers in a single rule
- Supports dynamic header values using FGH expressions
- Origin-specific routes (host:port + path patterns)
- **NEW**: Support for response-based headers that can use values from the response body
- Supports dynamic cache tag headers for fine-grained cache invalidation strategies
- Configurable logging with Pino-compatible logger interface
- Uses find-my-way for efficient URL routing and matching
- Respects existing headers (never overrides them)
- Only applies to GET and HEAD requests
- Supports wildcards and route parameters
- Handles nested routes with proper precedence (more specific routes take priority)
- Configurable routing behavior with find-my-way options

## Usage

```js
import { Agent, setGlobalDispatcher } from 'undici'
import { createInterceptor } from '@platformatic/slicer-interceptor'

// Create an interceptor with header rules
const interceptor = createInterceptor(
  {
    rules: [
      // Static header values
      { 
        routeToMatch: 'http://example.com/static/images/*', 
        headers: {
          'cache-control': 'public, max-age=604800',
          'content-type': 'image/jpeg',
          'x-custom-header': 'static-image',
          'x-cache-tags': { fgh: "'static', 'images'" }
        }
      }, // 1 week for images with custom headers
      
      { 
        routeToMatch: 'http://example.com/static/*', 
        headers: {
          'cache-control': 'public, max-age=86400',
          'x-cache-tags': { fgh: "'static', 'content'" }
        }
      }, // 1 day for other static content
      
      // Dynamic header values using FGH with request data
      { 
        routeToMatch: 'https://example.com/users/:userId', 
        headers: {
          'cache-control': 'private, max-age=3600',
          'x-user-route': 'true',
          'x-user-id': { fgh: '.params.userId' },
          'x-cache-tags': { fgh: "'user', 'user-' + .params.userId" }
        }
      }, // 1 hour for user profiles with user-specific tag
      
      // Dynamic header values using FGH with response body data
      { 
        routeToMatch: 'http://api.example.com/v1/products/:productId', 
        headers: {
          'cache-control': 'public, max-age=1800',
          'x-product-id': { fgh: '.params.productId' },
          'x-response-product-id': { fgh: '.response.body.id' }, // From response body
          'x-cache-tags': { fgh: "'product', 'product-' + .response.body.id" } // Uses response body data
        }
      }, // 30 minutes for product data with tags based on product ID from response
      
      { 
        routeToMatch: 'https://api.example.com/v1/cache/*', 
        headers: {
          'cache-control': 'public, max-age=3600',
          'x-cache-tags': { fgh: "'api', 'v1', 'cacheable'" }
        }
      }, // 1 hour for cacheable API
      
      { 
        routeToMatch: 'https://api.example.com/*', 
        headers: {
          'cache-control': 'no-store',
          'x-cache-tags': { fgh: "'api'" }
        }
      } // No caching for other API endpoints
    ],
    ignoreTrailingSlash: true,
    caseSensitive: false
  }
)

// Apply the interceptor to an Undici Agent
const agent = new Agent()
const composedAgent = agent.compose(interceptor)

// Use the agent for all requests
setGlobalDispatcher(composedAgent)
```

## Setting Headers

The interceptor uses the `headers` object to define headers to be applied to responses, with support for both static and dynamic values.

### Static Header Values

For static header values, simply use strings:

```js
const interceptor = createInterceptor({
  rules: [{
    routeToMatch: 'https://api.example.com/products',
    headers: {
      'cache-control': 'public, max-age=3600',
      'x-api-version': '1.0',
      'content-type': 'application/json',
      'x-custom-header': 'custom-value'
    }
  }]
})
```

### Dynamic Header Values with FGH

For dynamic header values, use an object with an `fgh` property containing an FGH expression:

#### Using Request Data

```js
const interceptor = createInterceptor({
  rules: [{
    routeToMatch: 'https://api.example.com/users/:userId',
    headers: {
      'cache-control': 'public, max-age=3600',
      'x-user-id': { fgh: '.params.userId' },
      'x-cache-tags': { fgh: "'user', 'user-' + .params.userId" }
    }
  }]
})
```

#### Using Response Body Data (NEW)

```js
const interceptor = createInterceptor({
  rules: [{
    routeToMatch: 'https://api.example.com/products/:productId',
    headers: {
      'cache-control': 'public, max-age=3600',
      'x-product-id': { fgh: '.params.productId' },
      'x-response-id': { fgh: '.response.body.id' },
      'x-cache-tags': { fgh: "'product', 'product-' + .response.body.id" }
    }
  }]
})
```

For expressions that reference `.response.body`, the interceptor will automatically detect this and use a special mode that processes the response body.

### Header Precedence

The interceptor never overrides existing headers in responses. If a response already has a header, it will not be changed or replaced, regardless of the rules.

1. Existing headers in the response (highest precedence)
2. Headers set by the `headers` object

This allows you to apply default headers while still allowing the server to have the final say when it specifically sets headers.

## Router Options

The interceptor accepts the following find-my-way options as a second parameter:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignoreTrailingSlash` | boolean | `false` | When set to `true`, `/api/users` and `/api/users/` will be treated as the same route |
| `ignoreDuplicateSlashes` | boolean | `false` | When set to `true`, `/api//users` and `/api/users` will be treated as the same route |
| `maxParamLength` | number | `100` | The maximum length of a parameter |
| `caseSensitive` | boolean | `true` | When set to `true`, `/api/users` and `/api/Users` will be treated as different routes |
| `useSemicolonDelimiter` | boolean | `false` | When set to `true`, use semicolon instead of ampersand as query parameter delimiter |

Example with options:

```js
const interceptor = createInterceptor(
  {
    rules: [
      { 
        routeToMatch: 'http://api.example.com/users', 
        headers: { 
          'cache-control': 'no-store', 
          'x-api-version': '1.0',
          'x-cache-tags': { fgh: "'users'" }
        } 
      }
    ],
    ignoreTrailingSlash: true,
    caseSensitive: false,
    ignoreDuplicateSlashes: true
  }
)
```

## Logging

The interceptor supports logging with any Pino-compatible logger. By default, it uses `abstract-logging` which is a no-op logger that doesn't output anything.

```js
import pino from 'pino'

// Create a Pino logger
const logger = pino({
  level: 'debug',  // Set your desired log level
  transport: {
    target: 'pino-pretty'
  }
})

// Create the interceptor with the logger
const interceptor = createInterceptor({
  rules: [
    // Your rules here
  ],
  logger: logger  // Pass your logger instance
})
```

The interceptor logs the following events:

- **Interceptor creation**: When the interceptor is created
- **Rule validation**: During rule validation
- **Router configuration**: When the routers are configured
- **Route matching**: When matching routes for requests
- **Header application**: When adding headers to responses
- **FGH compilation**: When compiling FGH expressions
- **FGH evaluation**: When evaluating FGH expressions
- **Error handling**: When errors occur during processing

Log levels used:

- `debug`: For normal operations and informational messages
- `error`: For errors during rule validation or FGH expression evaluation
- `trace`: For detailed context information (when enabled)

## Route Matching

The interceptor uses origin-based routing, where each route pattern must include both the origin (host and optional port) and the path.

### Route Format

Routes must follow this format:
```
[http(s)://]hostname[:port]/path
```

For example:
```
http://example.com/api/users
https://api.example.com:3000/products
http://localhost:8080/static/*
```

The protocol (http:// or https://) is optional but recommended for clarity.

### Origin Matching

The origin part of the route is matched against the request's origin, which is determined from:
1. The `host` header (highest priority)
2. The `origin` URL (second priority)
3. The `hostname`/`port` properties (lowest priority)

### Path Matching

The path part of the route uses [find-my-way](https://github.com/delvedor/find-my-way) for URL routing, which supports:

#### Simple paths

```js
{ 
  routeToMatch: 'http://api.example.com/users', 
  headers: { 'cache-control': 'no-store' } 
}
```

#### Wildcard paths

```js
{ 
  routeToMatch: 'https://cdn.example.com/static/*', 
  headers: { 'cache-control': 'public, max-age=86400' } 
}
```

#### Route parameters

```js
{ 
  routeToMatch: 'http://api.example.com/users/:userId', 
  headers: { 
    'cache-control': 'private, max-age=3600',
    'x-user-id': { fgh: '.params.userId' }
  } 
}
```

#### Combining parameters and wildcards

```js
{ 
  routeToMatch: 'https://app.example.com/:tenant/dashboard/*', 
  headers: { 
    'cache-control': 'private, max-age=60',
    'x-tenant': { fgh: '.params.tenant' }
  } 
}
```

When defining rules, more specific paths take precedence over more general ones. For example, if you have rules for both `https://api.example.com/*` and `https://api.example.com/v1/cache/*`, requests to `https://api.example.com/v1/cache/data` will use the `https://api.example.com/v1/cache/*` rule.

## Dynamic Headers with FGH

The interceptor supports generating dynamic header values using FGH expressions. This is particularly useful for cache tags, user-specific headers, or any value that needs to be generated based on the request context.

### FGH Expression Syntax

FGH expressions use a simple query language that's similar to jq syntax. These expressions are evaluated against a context object containing request information or response data.

#### Available Context Properties

- `.path` - The full path of the request
- `.params` - An object containing route parameters (e.g., `:userId` becomes `.params.userId`)
- `.querystring` - An object containing query string parameters
- `.headers` - An object containing request headers (lowercase keys)
- `.response.body` - The parsed JSON response body (when response body access is used)

#### Expression Types

##### String Literals

String literals must be wrapped in single quotes:

```js
'static-tag', 'constant-value'
```

##### Route Parameters

Access route parameters using the `.params` object:

```js
.params.userId
```

For a route like `/users/123`, this would evaluate to `123`.

##### Query String Parameters

Access query string parameters using the `.querystring` object:

```js
.querystring.category
```

For a request to `/products?category=electronics`, this would evaluate to `electronics`.

##### Request Headers

Access request headers using the `.headers` object:

```js
.headers["x-tenant-id"]
```

For a request with `X-Tenant-ID: tenant-123` header, this would evaluate to `tenant-123`.

##### Response Body Access (NEW)

Access the response body data using the `.response.body` object:

```js
.response.body.id
```

For a response with `{"id": "prod-123", "name": "Sample Product"}`, this would evaluate to `prod-123`.

For array responses, you can iterate through the items:

```js
.response.body[].id
```

For a response with `[{"id": "prod-1"}, {"id": "prod-2"}]`, this would evaluate to `prod-1,prod-2`.

##### Combining Values

You can concatenate values using the `+` operator:

```js
'product-' + .params.productId
```

##### Default Values with Null Coalescing

Use the `//` operator to provide default values when a parameter is missing:

```js
.querystring.variant // 'default'
```

This will use the `variant` query parameter if present, or fall back to `'default'` if not.

### Using FGH for Header Values

To use an FGH expression for a header value, specify an object with an `fgh` property:

```js
{
  routeToMatch: 'http://api.example.com/users/:userId',
  headers: {
    'cache-control': 'private, max-age=3600',
    'x-user-id': { fgh: '.params.userId' },
    'x-organization': { fgh: '.headers["x-org-id"] // "default-org"' }
  }
}
```

### Examples

#### Cache Tags with Static Values

```js
{
  routeToMatch: 'https://cdn.example.com/static/*',
  headers: { 
    'cache-control': 'public, max-age=86400',
    'x-cache-tags': { fgh: "'static', 'cdn'" }
  }
}
```

This will add `x-cache-tags: static,cdn` to all matching responses.

#### User-specific Headers

```js
{
  routeToMatch: 'https://api.example.com/users/:userId',
  headers: { 
    'cache-control': 'private, max-age=3600',
    'x-user-id': { fgh: '.params.userId' },
    'x-cache-tags': { fgh: "'user-' + .params.userId, 'type-user'" }
  }
}
```

For `/users/123`, this adds:
- `x-user-id: 123`
- `x-cache-tags: user-123,type-user`

#### Response Body Headers (NEW)

```js
{
  routeToMatch: 'http://api.example.com/products/:productId',
  headers: { 
    'cache-control': 'public, max-age=3600',
    'x-product-id': { fgh: '.params.productId' },
    'x-product-name': { fgh: '.response.body.name' },
    'x-cache-tags': { fgh: "'product-' + .response.body.id" }
  }
}
```

For a response with `{"id": "laptop-123", "name": "MacBook Pro"}`, this adds:
- `x-product-id: [productId from route]`
- `x-product-name: MacBook Pro`
- `x-cache-tags: product-laptop-123`

#### Array Responses (NEW)

```js
{
  routeToMatch: 'http://api.example.com/products',
  headers: { 
    'cache-control': 'public, max-age=3600',
    'x-product-count': { fgh: '.response.body | length' },
    'x-cache-tags': { fgh: "'products', .response.body[].id" }
  }
}
```

For a response with `[{"id": "prod-1"}, {"id": "prod-2"}, {"id": "prod-3"}]`, this adds:
- `x-product-count: 3`
- `x-cache-tags: products,prod-1,prod-2,prod-3`

### Error Handling

#### Compilation Errors

Invalid FGH expressions will cause an error when creating the interceptor:

```js
// This will throw an error
createInterceptor({
  rules: [{
    routeToMatch: 'https://api.example.com/invalid-test',
    headers: { 
      'cache-control': 'public, max-age=3600',
      'x-invalid': { fgh: 'invalid[expression' } // Syntax error
    }
  }]
})
```

#### Runtime Errors

If an expression fails at runtime (e.g., trying to access a property of undefined), it will:
1. Log an error to the console
2. Skip the failed header
3. Continue with other valid headers

In this case, the expression would automatically target the custom header name.

## Implementation Notes

### Request-Based Headers

Headers that only use request data (`.params`, `.querystring`, `.headers`) are applied during the `onHeaders` phase of the request lifecycle. This is the standard approach and has minimal overhead.

### Response-Based Headers (NEW)

Headers that access the response body (using `.response.body`) require a more complex implementation. The interceptor automatically detects these expressions and uses a specialized handler that:

1. Identifies rules that contain `.response.body` expressions
2. For these rules, it adds request-based headers normally
3. Response body based headers are skipped during initial processing

Currently, response body based headers will be supported in a future update. The implementation is still in progress.

## Best Practices

1. **Prefer request-based headers**: When possible, use request data instead of response data
2. **Use static values when possible**: Only use FGH expressions when you need dynamic values
3. **Keep expressions simple**: Avoid deeply nested expressions for better performance
4. **Provide default values**: Use the null coalescing operator for optional parameters
5. **Consider security**: Avoid including sensitive data in headers
6. **Be consistent**: Use a standard naming convention for headers across your application
7. **Prefix tags**: For cache tags, use prefixes to organize them (e.g., `user-`, `product-`)
8. **Test your expressions**: Verify that your FGH expressions generate the expected values

## Notes

- The interceptor only adds headers if they don't already exist in the response
- Headers are only added to GET and HEAD requests
- The interceptor respects the find-my-way pattern syntax
- You must explicitly add wildcards (`*`) in your patterns when needed
- FGH expressions are compiled using the FGH library
- Each route must include both the origin (host:port) and path
- The origin is matched against the request's host header, origin URL, or hostname/port
- You can optionally include the protocol (http:// or https://) in route definitions for clarity

## License

Apache-2.0
