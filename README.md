# make-cacheable-interceptor

A library that creates an Undici interceptor to automatically add cache-control headers to responses based on URL routing patterns using [find-my-way](https://github.com/delvedor/find-my-way).

## Installation

```bash
npm install make-cacheable-interceptor
```

## Features

- Automatically adds cache-control headers to HTTP responses based on URL patterns
- Origin-specific routes (host:port + path patterns)
- Adds cache tag headers for fine-grained cache invalidation strategies
- Uses find-my-way for efficient URL routing and matching
- Respects existing cache-control and cache tag headers (never overrides them)
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
      routeToMatch: 'http://example.com/static/images/*', 
      cacheControl: 'public, max-age=604800',
      cacheTags: "'static', 'images'" 
    }, // 1 week for images
    { 
      routeToMatch: 'http://example.com/static/*', 
      cacheControl: 'public, max-age=86400',
      cacheTags: "'static', 'content'"
    }, // 1 day for other static content
    { 
      routeToMatch: 'https://example.com/users/:userId', 
      cacheControl: 'private, max-age=3600',
      cacheTags: "'user', 'user-' + .params.userId" 
    }, // 1 hour for user profiles with user-specific tag
    { 
      routeToMatch: 'http://api.example.com/v1/products/:productId', 
      cacheControl: 'public, max-age=1800',
      cacheTags: "'api', 'product', 'product-' + .params.productId, .querystring.variant // 'default'" 
    }, // 30 minutes for product data with tags based on product ID and variant
    { 
      routeToMatch: 'https://api.example.com/v1/cache/*', 
      cacheControl: 'public, max-age=3600',
      cacheTags: "'api', 'v1', 'cacheable'"
    }, // 1 hour for cacheable API
    { 
      routeToMatch: 'https://api.example.com/*', 
      cacheControl: 'no-store',
      cacheTags: "'api'"
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
| `cacheTagsHeader` | string | `'x-cache-tags'` | The name of the header to use for cache tags |

Example with options:

```js
const interceptor = createInterceptor(
  [
    { routeToMatch: 'http://api.example.com/users', cacheControl: 'no-store' }
  ],
  {
    ignoreTrailingSlash: true,
    caseSensitive: false,
    ignoreDuplicateSlashes: true,
    cacheTagsHeader: 'x-custom-cache-tags' // Use a custom header name for cache tags
  }
)
```

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
{ routeToMatch: 'http://api.example.com/users', cacheControl: 'no-store' }
```

#### Wildcard paths

```js
{ routeToMatch: 'https://cdn.example.com/static/*', cacheControl: 'public, max-age=86400' }
```

#### Route parameters

```js
{ routeToMatch: 'http://api.example.com/users/:userId', cacheControl: 'private, max-age=3600' }
{ routeToMatch: 'https://api.example.com/products/:category/:productId', cacheControl: 'public, max-age=86400' }
```

#### Combining parameters and wildcards

```js
{ routeToMatch: 'https://app.example.com/:tenant/dashboard/*', cacheControl: 'private, max-age=60' }
```

When defining rules, more specific paths take precedence over more general ones. For example, if you have rules for both `https://api.example.com/*` and `https://api.example.com/v1/cache/*`, requests to `https://api.example.com/v1/cache/data` will use the `https://api.example.com/v1/cache/*` rule.

## Cache Tags

Cache tags provide a powerful way to implement targeted cache invalidation strategies. You can dynamically generate cache tag headers based on URL path patterns, route parameters, and query string values. By default, these are added as `x-cache-tags` headers, but you can customize the header name using the `cacheTagsHeader` option.

### Basic Usage

Cache tags are defined as a string expression on each route rule, with multiple values separated by commas:

```js
import { createInterceptor } from 'make-cacheable-interceptor'

const interceptor = createInterceptor([
  {
    routeToMatch: 'https://api.example.com/users/:userId',
    cacheControl: 'private, max-age=3600',
    cacheTags: "'user-' + .params.userId, 'type-user'"
  },
  {
    routeToMatch: 'http://api.example.com/products',
    cacheControl: 'public, max-age=3600',
    cacheTags: ".querystring.category, 'products'"
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
cacheTags: "'static-tag', 'constant-value'"
```

##### Route Parameters

Access route parameters using the `.params` object:

```js
cacheTags: "'user-' + .params.userId"
```

For a route like `/users/123`, this would generate a cache tag of `user-123`.

##### Query String Parameters

Access query string parameters using the `.querystring` object:

```js
cacheTags: ".querystring.category"
```

For a request to `/products?category=electronics`, this would generate a cache tag of `electronics`.

##### Combining Values

You can concatenate values using the `+` operator:

```js
cacheTags: "'product-' + .params.productId, 'category-' + .querystring.category"
```

##### Default Values with Null Coalescing

Use the `//` operator to provide default values when a parameter is missing:

```js
cacheTags: ".querystring.variant // 'default'"
```

This will use the `variant` query parameter if present, or fall back to `'default'` if not.

### Examples

#### Static Tags

```js
{
  routeToMatch: 'https://cdn.example.com/static/*',
  cacheControl: 'public, max-age=86400',
  cacheTags: "'static', 'cdn'"
}
```

This will add `x-cache-tags: static,cdn` to all matching responses (or your custom header name if specified).

#### User-specific Resources

```js
{
  routeToMatch: 'https://api.example.com/users/:userId',
  cacheControl: 'private, max-age=3600',
  cacheTags: "'user-' + .params.userId, 'type-user'"
}
```

For `/users/123`, this adds `x-cache-tags: user-123,type-user` (or your custom header name if specified).

#### Product Categories

```js
{
  routeToMatch: 'http://api.example.com/products',
  cacheControl: 'public, max-age=3600',
  cacheTags: ".querystring.category, 'products'"
}
```

For `/products?category=electronics`, this adds `x-cache-tags: electronics,products` (or your custom header name if specified).

#### Complex API Paths

```js
{
  routeToMatch: 'https://api.example.com/:version/categories/:categoryId/products/:productId',
  cacheControl: 'public, max-age=3600',
  cacheTags: "'api-version-' + .params.version, 'category-' + .params.categoryId, 'product-' + .params.productId, .querystring.variant // 'default'"
}
```

For `/api/v1/categories/electronics/products/laptop-123?variant=premium`, this adds:
`x-cache-tags: api-version-v1,category-electronics,product-laptop-123,premium` (or your custom header name if specified)

### Error Handling

#### Compilation Errors

Invalid expressions will cause an error when creating the interceptor:

```js
// This will throw an error
createInterceptor([
  {
    routeToMatch: 'https://api.example.com/invalid-test',
    cacheControl: 'public, max-age=3600',
    cacheTags: 'invalid[expression' // Syntax error
  }
])
```

#### Runtime Errors

If an expression fails at runtime (e.g., trying to access a property of undefined), it will:
1. Log an error to the console
2. Skip the failed expression
3. Continue with other valid expressions

### Custom Cache Tag Header

You can customize the name of the header used for cache tags by setting the `cacheTagsHeader` option:

```js
const interceptor = createInterceptor(
  [
    {
      routeToMatch: 'https://api.example.com/products/:id',
      cacheControl: 'public, max-age=3600',
      cacheTags: "'product-' + .params.id, 'category-all'"
    }
  ],
  {
    cacheTagsHeader: 'x-purge-tags' // Use custom header name instead of 'x-cache-tags'
  }
)
```

With this configuration, for a request to `/products/123`, the response will include:
```
x-purge-tags: product-123,category-all
```

This is particularly useful when integrating with different CDN providers or cache systems that use specific header names for cache invalidation.

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
- The interceptor only adds cache tag headers if none exist in the response
- Headers are only added to GET and HEAD requests
- The interceptor respects the find-my-way pattern syntax
- You must explicitly add wildcards (`*`) in your patterns when needed
- Cache tag expressions are compiled using the FGH library
- Each route must include both the origin (host:port) and path
- The origin is matched against the request's host header, origin URL, or hostname/port
- You can optionally include the protocol (http:// or https://) in route definitions for clarity

## License

Apache-2.0
