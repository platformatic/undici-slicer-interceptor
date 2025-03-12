# make-cacheable-interceptor

A library that creates an Undici interceptor to automatically add cache-control headers to responses based on URL routing patterns using [find-my-way](https://github.com/delvedor/find-my-way).

## Installation

```bash
npm install make-cacheable-interceptor
```

## Features

- Automatically adds cache-control headers to HTTP responses based on URL patterns
- Adds x-cache-tags headers for fine-grained cache invalidation strategies
- Uses find-my-way for efficient URL routing and matching
- Respects existing cache-control and x-cache-tags headers (never overrides them)
- Only applies to GET and HEAD requests
- Supports wildcards and route parameters
- Handles nested routes with proper precedence (more specific routes take priority)
- Configurable routing behavior with find-my-way options

## Usage

```js
import { Agent, setGlobalDispatcher } from 'undici'
import { createInterceptor } from 'make-cacheable-interceptor'

// Create an interceptor with caching rules
const interceptor = createInterceptor(
  [
    // More specific rules should come first
    { 
      routeToMatch: '/static/images/*', 
      cacheControl: 'public, max-age=604800',
      cacheTags: ["'static'", "'images'"] 
    }, // 1 week for images
    { 
      routeToMatch: '/static/*', 
      cacheControl: 'public, max-age=86400',
      cacheTags: ["'static'", "'content'"]
    }, // 1 day for other static content
    { 
      routeToMatch: '/users/:userId', 
      cacheControl: 'private, max-age=3600',
      cacheTags: ["'user'", "'user-' + .params.userId"] 
    }, // 1 hour for user profiles with user-specific tag
    { 
      routeToMatch: '/api/v1/products/:productId', 
      cacheControl: 'public, max-age=1800',
      cacheTags: ["'api'", "'product'", "'product-' + .params.productId", ".querystring.variant // 'default'"] 
    }, // 30 minutes for product data with tags based on product ID and variant
    { 
      routeToMatch: '/api/v1/cache/*', 
      cacheControl: 'public, max-age=3600',
      cacheTags: ["'api'", "'v1'", "'cacheable'"]
    }, // 1 hour for cacheable API
    { 
      routeToMatch: '/api/*', 
      cacheControl: 'no-store',
      cacheTags: ["'api'"]
    } // No caching for other API endpoints
  ],
  { 
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
  [
    { routeToMatch: '/api/users', cacheControl: 'no-store' }
  ],
  {
    ignoreTrailingSlash: true,
    caseSensitive: false,
    ignoreDuplicateSlashes: true
  }
)
```

## Route Matching

The interceptor uses [find-my-way](https://github.com/delvedor/find-my-way) for URL routing, which supports:

### Simple paths

```js
{ routeToMatch: '/api/users', cacheControl: 'no-store' }
```

### Wildcard paths

```js
{ routeToMatch: '/static/*', cacheControl: 'public, max-age=86400' }
```

### Route parameters

```js
{ routeToMatch: '/users/:userId', cacheControl: 'private, max-age=3600' }
{ routeToMatch: '/products/:category/:productId', cacheControl: 'public, max-age=86400' }
```

### Combining parameters and wildcards

```js
{ routeToMatch: '/:tenant/dashboard/*', cacheControl: 'private, max-age=60' }
```

When defining rules, more specific paths take precedence over more general ones. For example, if you have rules for both `/api/*` and `/api/v1/cache/*`, requests to `/api/v1/cache/data` will use the `/api/v1/cache/*` rule.

## Cache Tags

Cache tags provide a powerful way to implement targeted cache invalidation strategies. You can dynamically generate `x-cache-tags` headers based on URL path patterns, route parameters, and query string values.

### Basic Usage

Cache tags are defined as an array of expressions on each route rule:

```js
import { createInterceptor } from 'make-cacheable-interceptor'

const interceptor = createInterceptor([
  {
    routeToMatch: '/users/:userId',
    cacheControl: 'private, max-age=3600',
    cacheTags: ["'user-' + .params.userId", "'type-user'"]
  },
  {
    routeToMatch: '/products',
    cacheControl: 'public, max-age=3600',
    cacheTags: ['.querystring.category', "'products'"]
  }
])
```

### Expression Syntax

Cache tag expressions use the FGH query language, which is similar to jq syntax. Expressions are evaluated against a context object containing request information.

#### Available Context Properties

- `.path` - The full path of the request
- `.params` - An object containing route parameters (e.g., `:userId` becomes `.params.userId`)
- `.querystring` - An object containing query string parameters

#### Expression Types

##### String Literals

String literals must be wrapped in single quotes:

```js
cacheTags: ["'static-tag'", "'constant-value'"]
```

##### Route Parameters

Access route parameters using the `.params` object:

```js
cacheTags: ["'user-' + .params.userId"]
```

For a route like `/users/123`, this would generate a cache tag of `user-123`.

##### Query String Parameters

Access query string parameters using the `.querystring` object:

```js
cacheTags: ['.querystring.category']
```

For a request to `/products?category=electronics`, this would generate a cache tag of `electronics`.

##### Combining Values

You can concatenate values using the `+` operator:

```js
cacheTags: ["'product-' + .params.productId", "'category-' + .querystring.category"]
```

##### Default Values with Null Coalescing

Use the `//` operator to provide default values when a parameter is missing:

```js
cacheTags: [".querystring.variant // 'default'"]
```

This will use the `variant` query parameter if present, or fall back to `'default'` if not.

### Examples

#### Static Tags

```js
{
  routeToMatch: '/static/*',
  cacheControl: 'public, max-age=86400',
  cacheTags: ["'static'", "'cdn'"]
}
```

This will add `x-cache-tags: static,cdn` to all matching responses.

#### User-specific Resources

```js
{
  routeToMatch: '/users/:userId',
  cacheControl: 'private, max-age=3600',
  cacheTags: ["'user-' + .params.userId", "'type-user'"]
}
```

For `/users/123`, this adds `x-cache-tags: user-123,type-user`.

#### Product Categories

```js
{
  routeToMatch: '/products',
  cacheControl: 'public, max-age=3600',
  cacheTags: ['.querystring.category', "'products'"]
}
```

For `/products?category=electronics`, this adds `x-cache-tags: electronics,products`.

#### Complex API Paths

```js
{
  routeToMatch: '/api/:version/categories/:categoryId/products/:productId',
  cacheControl: 'public, max-age=3600',
  cacheTags: [
    "'api-version-' + .params.version",
    "'category-' + .params.categoryId",
    "'product-' + .params.productId",
    ".querystring.variant // 'default'"
  ]
}
```

For `/api/v1/categories/electronics/products/laptop-123?variant=premium`, this adds:
`x-cache-tags: api-version-v1,category-electronics,product-laptop-123,premium`

### Error Handling

#### Compilation Errors

Invalid expressions will cause an error when creating the interceptor:

```js
// This will throw an error
createInterceptor([
  {
    routeToMatch: '/invalid-test',
    cacheControl: 'public, max-age=3600',
    cacheTags: ['invalid[expression'] // Syntax error
  }
])
```

#### Runtime Errors

If an expression fails at runtime (e.g., trying to access a property of undefined), it will:
1. Log an error to the console
2. Skip the failed expression
3. Continue with other valid expressions

### Best Practices

1. **Start simple**: Begin with static tags for broad categories
2. **Use meaningful prefixes**: Prefix tags with their type (e.g., `user-`, `product-`)
3. **Avoid deeply nested expressions**: Keep expressions simple for better performance
4. **Provide default values**: Use the null coalescing operator for optional parameters
5. **Test your expressions**: Verify that your tag expressions generate the expected values
6. **Cache tag naming conventions**: Use consistent naming patterns across your application
7. **Don't leak sensitive information**: Avoid including sensitive data in cache tags

## Notes

- The interceptor only adds cache-control headers if none exist in the response
- The interceptor only adds x-cache-tags headers if none exist in the response
- Headers are only added to GET and HEAD requests
- The interceptor respects the find-my-way pattern syntax
- You must explicitly add wildcards (`*`) in your patterns when needed
- Cache tag expressions are compiled using the FGH library

## License

Apache-2.0
