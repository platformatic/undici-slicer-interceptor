import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - cache tags from request headers', () => {
  test('should add x-cache-tags header based on request headers', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using header-based cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: '/api/with-headers',
          cacheControl: 'public, max-age=3600',
          cacheTags: '.headers["x-user-id"], "api"'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with custom header
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/with-headers',
        headers: {
          'x-user-id': 'user-123'
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'user-123,api')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle multiple request headers in cache tags', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using multiple header-based cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: '/api/complex-headers/:resource',
          cacheControl: 'public, max-age=3600',
          cacheTags: '.headers["x-tenant-id"], .headers["x-api-version"] // "v1", "tenant-" + .headers["x-tenant-id"] + "-" + .params.resource'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with all headers
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/complex-headers/users',
        headers: {
          'x-tenant-id': 'acme',
          'x-api-version': 'v2'
        }
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(
        res1.headers['x-cache-tags'],
        'acme,v2,tenant-acme-users'
      )
      await res1.body.dump()

      // Test request with missing header (should use default)
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/complex-headers/products',
        headers: {
          'x-tenant-id': 'acme'
          // No x-api-version header, should use default 'v1'
        }
      })

      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(
        res2.headers['x-cache-tags'],
        'acme,v1,tenant-acme-products'
      )
      await res2.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle combination of headers, params and querystring in cache tags', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using a combination of sources for cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: '/api/:version/resources/:resource',
          cacheControl: 'public, max-age=3600',
          cacheTags: '"api-version-" + .params.version, "resource-" + .params.resource, .headers["x-tenant-id"] // "default", .querystring.filter'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with all sources
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/v2/resources/users?filter=active',
        headers: {
          'x-tenant-id': 'acme'
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(
        res.headers['x-cache-tags'],
        'api-version-v2,resource-users,acme,active'
      )
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle case-insensitive header names', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using header-based cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: '/api/case-insensitive-headers',
          cacheControl: 'public, max-age=3600',
          cacheTags: '.headers["authorization"]'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with Authorization header (capitalized)
      // HTTP header names are case-insensitive, so we need to test that we can access them
      // regardless of the case used in the rule
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/case-insensitive-headers',
        headers: {
          Authorization: 'Bearer token123'
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'Bearer token123')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
