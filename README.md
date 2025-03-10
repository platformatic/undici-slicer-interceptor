# make-cacheable-interceptor

A library that creates an Undici interceptor to automatically add cache-control headers to responses based on URL routing patterns using [find-my-way](https://github.com/delvedor/find-my-way).

## Installation

```bash
npm install make-cacheable-interceptor
```

## Features

- Automatically adds cache-control headers to HTTP responses based on URL patterns
- Uses find-my-way for efficient URL routing and matching
- Respects existing cache-control headers (never overrides them)
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
    { routeToMatch: '/static/images/*', cacheControl: 'public, max-age=604800' }, // 1 week for images
    { routeToMatch: '/static/*', cacheControl: 'public, max-age=86400' }, // 1 day for other static content
    { routeToMatch: '/api/v1/cache/*', cacheControl: 'public, max-age=3600' }, // 1 hour for cacheable API
    { routeToMatch: '/api/*', cacheControl: 'no-store' } // No caching for other API endpoints
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

## Notes

- The interceptor only adds cache-control headers if none exist in the response
- Headers are only added to GET and HEAD requests
- The interceptor respects the find-my-way pattern syntax
- You must explicitly add wildcards (`*`) in your patterns when needed

## License

Apache-2.0
