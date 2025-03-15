# @platformatic/slicer-interceptor

A library that creates an Undici interceptor to automatically add headers to responses based on URL routing patterns using [find-my-way](https://github.com/delvedor/find-my-way). It can also transform response bodies using FGH expressions.

## Installation

```bash
npm install @platformatic/slicer-interceptor
```

## Features

- Automatically adds headers to HTTP responses based on URL patterns
- Supports defining multiple headers in a single rule
- Supports dynamic header values using FGH expressions
- Origin-specific routes (host:port + path patterns)
- Supports dynamic cache tag headers for fine-grained cache invalidation strategies
- **Supports response body-based headers** for advanced caching strategies
- **Supports response body transformation** for modifying JSON responses
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
      
      // Dynamic header values using FGH
      { 
        routeToMatch: 'https://example.com/users/:userId', 
        headers: {
          'cache-control': 'private, max-age=3600',
          'x-user-route': 'true',
          'x-user-id': { fgh: '.params.userId' },
          'x-cache-tags': { fgh: "'user', 'user-' + .params.userId" }
        }
      }, // 1 hour for user profiles with user-specific tag
      
      // Dynamic header based on response body content
      { 
        routeToMatch: 'http://api.example.com/v1/products/:productId', 
        headers: {
          'cache-control': 'public, max-age=1800',
          'x-product-id': { fgh: '.params.productId' },
          'x-product-real-id': { fgh: '.response.body.id' }, // Response body access
          'x-cache-tags': { fgh: "'api', 'product', 'product-' + .params.productId, 'category-' + .response.body.category" }
        },
        // Transform the response body by adding a cached flag
        responseBodyTransform: { fgh: '. + { cached: true, timestamp: "cached at: " + .response.headers["date"] }' }
      }, // 30 minutes for product data with tags based on product ID and category from response
      
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

### Header Precedence

The interceptor never overrides existing headers in responses. If a response already has a header, it will not be changed or replaced, regardless of the rules.

1. Existing headers in the response (highest precedence)
2. Headers set by the `headers` object

This allows you to apply default headers while still allowing the server to have the final say when it specifically sets headers.

## Response Body Transformation

The interceptor supports transforming the response body using FGH expressions. This allows you to modify JSON responses before they are sent to the client.

### Configuring a Response Body Transformation

To transform a response body, add a `responseBodyTransform` property to the rule with an FGH expression:

```js
const interceptor = createInterceptor({
  rules: [{
    routeToMatch: 'http://api.example.com/v1/products/:productId',
    // Set headers
    headers: {
      'cache-control': 'public, max-age=1800',
      'x-product-id': { fgh: '.params.productId' }
    },
    // Transform the response body
    responseBodyTransform: {
      fgh: '. + { cached: true, timestamp: .response.headers["date"] }'
    }
  }]
})
```

### Use Cases for Response Body Transformation

1. **Add Metadata**: Add cached flags, timestamps, or other metadata to responses

```js
responseBodyTransform: {
  fgh: '. + { cached: true, timestamp: .response.headers["date"] }'
}
```

Example from the codebase:

```js
// Transform the response body
responseBodyTransform: { fgh: '. + { cached: true, timestamp: .response.headers["date"] }' }
```

2. **Filter Array Responses**: Filter array items based on criteria

```js
responseBodyTransform: {
  fgh: 'map(select(.price > 100))'
}
```

3. **Add Computed Properties**: Add calculated values to responses

```js
responseBodyTransform: {
  fgh: '. + { total: 40, itemCount: 2 }'
}
```

4. **Combine with Route Parameters**: Use route parameters in transformations

```js
responseBodyTransform: {
  fgh: '. + { route_id: .params.productId, processed: true }'
}
```

### Limitations and Considerations

- Only works with JSON responses (Content-Type: application/json)
- The response body must be fully buffered in memory
- JSON parsing and serialization add processing overhead
- The content-length header is updated to reflect the size of the transformed body
- The transformation is applied before the response is sent to the client
- If the transformation fails, the original response is sent
- Route parameters (`.params`) are not currently available in body transformation expressions
- Only works for 200 status responses - other status codes will be passed through without transformation
- Performance impact should be considered for large response bodies

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

## Route Matching

### Logging

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

The interceptor supports generating dynamic header values using FGH expressions. This is particularly useful for cache tags, user-specific headers, or any value that needs to be generated based on the request context or response body.

### FGH Expression Syntax

FGH expressions use a simple query language that's similar to jq syntax. These expressions are evaluated against a context object containing request information.

#### Available Context Properties

- `.path` - The full path of the request
- `.params` - An object containing route parameters (e.g., `:userId` becomes `.params.userId`)
- `.querystring` - An object containing query string parameters
- `.headers` - An object containing request headers (lowercase keys)
- `.response` - An object containing response data (only available when using response-based headers)

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

##### Response Body Access

Access the response body using the `.response.body` property:

```js
.response.body.id
```

This accesses the `id` property of the response body.

For array responses, you can use array iteration:

```js
.response.body[].id
```

This extracts the `id` property from each item in the response array.

##### Response Body Properties

Access properties from the response body using the `.response.body` property:

```js
.response.body.id
```

For a response containing `{"id": "product-123", "name": "Widget"}`, this would evaluate to `product-123`.

For array responses, you can use array iteration:

```js
.response.body[].id
```

This extracts all `id` values from an array response.

##### Response Headers

Access response headers using the `.response.headers` object:

```js
.response.headers["content-type"]
```

This extracts the content-type header from the response. Header names should always be lowercase for consistent access.

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

#### Product Category Headers

```js
{
  routeToMatch: 'http://api.example.com/products',
  headers: { 
    'cache-control': 'public, max-age=3600',
    'x-category': { fgh: '.querystring.category // "all"' },
    'x-cache-tags': { fgh: ".querystring.category, 'products'" }
  }
}
```

For `/products?category=electronics`, this adds:
- `x-category: electronics`
- `x-cache-tags: electronics,products`

#### Complex API Paths with Multiple Dynamic Values

```js
{
  routeToMatch: 'https://api.example.com/:version/categories/:categoryId/products/:productId',
  headers: { 
    'cache-control': 'public, max-age=3600',
    'x-api-version': { fgh: '.params.version' },
    'x-category': { fgh: '.params.categoryId' },
    'x-product': { fgh: '.params.productId' },
    'x-variant': { fgh: '.querystring.variant // "default"' },
    'x-cache-tags': { fgh: "'api-version-' + .params.version, 'category-' + .params.categoryId, 'product-' + .params.productId, .querystring.variant // 'default'" }
  }
}
```

For `/api/v1/categories/electronics/products/laptop-123?variant=premium`, this adds:
- `x-api-version: v1`
- `x-category: electronics`
- `x-product: laptop-123`
- `x-variant: premium`
- `x-cache-tags: api-version-v1,category-electronics,product-laptop-123,premium`

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

## Response Body-Based Headers

The interceptor now supports generating header values based on the response body content. This powerful feature allows for more sophisticated caching strategies where cache tags and other headers can be derived directly from the response data.

### How It Works

When an FGH expression contains a reference to `.response.body`, the interceptor will:

1. Buffer the entire response body
2. Parse it as JSON
3. Make the parsed JSON available to the FGH expression
4. Generate header values based on the response content

This happens automatically - you simply use `.response.body` in your FGH expressions, and the interceptor handles the rest.

### Response Context Properties

- `.response.body` - The parsed JSON body of the response
- `.response.statusCode` - The HTTP status code of the response
- `.response.headers` - An object containing the response headers (lowercase keys)

### Example

```js
const interceptor = createInterceptor({
  rules: [{
    routeToMatch: 'https://api.example.com/products/:productId',
    headers: {
      'cache-control': 'public, max-age=3600',
      'x-product-id': { fgh: '.params.productId' }, // Request-based
      'x-product-real-id': { fgh: '.response.body.id' }, // Response body-based
      'x-original-server': { fgh: '.response.headers["server"]' }, // Response header-based
      'x-content-type': { fgh: '.response.headers["content-type"]' }, // Response header-based
      'x-cache-tags': { 
        fgh: "'product', 'product-' + .params.productId, 'category-' + .response.body.category" 
      } // Mixed request/response based
    },
    // Transform the response body as well
    responseBodyTransform: {
      fgh: '. + { cached: true, timestamp: .response.headers["date"] }'
    }
  }]
})
```

For a request to `/products/123` that returns:
```json
{
  "id": "product-abc",
  "name": "Super Widget",
  "category": "widgets"
}
```

The interceptor will add these headers:
- `x-product-id: 123` (from the URL parameter)
- `x-product-real-id: product-abc` (from the response body)
- `x-original-server: nginx` (from the response headers)
- `x-content-type: application/json` (from the response headers)
- `x-cache-tags: product,product-123,category-widgets` (mixed sources)

And transform the body to:
```json
{
  "id": "product-abc",
  "name": "Super Widget",
  "category": "widgets",
  "cached": true,
  "timestamp": "Wed, 15 Mar 2025 12:00:00 GMT"
}
```

### Working with Array Responses

You can use array iteration to generate headers from array responses:

```js
const interceptor = createInterceptor({
  rules: [{
    routeToMatch: 'https://api.example.com/products',
    headers: {
      'cache-control': 'public, max-age=1800',
      'x-cache-tags': { fgh: "'products', .response.body[].id" }
    },
    // Filter products with price > 15
    responseBodyTransform: { 
      fgh: 'map(select(.price > 15))' 
    }
  }]
})
```

For a response containing:
```json
[
  { "id": "product-1", "name": "Widget A", "price": 10 },
  { "id": "product-2", "name": "Widget B", "price": 20 },
  { "id": "product-3", "name": "Widget C", "price": 30 }
]
```

This will:
- Add header: `x-cache-tags: products,product-1,product-2,product-3`
- Transform body to only include products with price > 15:
```json
[
  { "id": "product-2", "name": "Widget B", "price": 20 },
  { "id": "product-3", "name": "Widget C", "price": 30 }
]
```

### Performance Considerations

Response-based features introduce some overhead:

1. The complete response body must be buffered in memory
2. The JSON parsing adds processing time
3. The response will only be sent after the entire body is received and processed

For these reasons:

- Only use response-based features when necessary
- The interceptor automatically detects which rules need response processing and only buffers responses for those routes
- Consider applying response-based features only to critical routes that need this functionality

### Error Handling

If the response cannot be parsed as JSON, or if a referenced property doesn't exist:

1. Request-based headers will still be applied
2. Headers that depend on the response body will be skipped
3. The response body transformation will be skipped (original body is returned)
4. The error will be logged (if a logger is configured)
5. The request will continue to be processed normally

### Limitations

- Only JSON responses are supported (the interceptor attempts to parse the response body as JSON)
- The entire response body must be buffered in memory before processing
- Large responses may impact performance
- Non-200 responses will only receive request-based headers (response body is not processed)

## Best Practices

1. **Use static values when possible**: Only use FGH expressions when you need dynamic values
2. **Keep expressions simple**: Avoid deeply nested expressions for better performance
3. **Provide default values**: Use the null coalescing operator for optional parameters
4. **Consider security**: Avoid including sensitive data in headers
5. **Be consistent**: Use a standard naming convention for headers across your application
6. **Prefix tags**: For cache tags, use prefixes to organize them (e.g., `user-`, `product-`)
7. **Test your expressions**: Verify that your FGH expressions generate the expected values
8. **Use response-based features judiciously**: Only use response body-based features when the benefits outweigh the performance cost

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
