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
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using request header-based cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/api/auth`,
          headers: { 'cache-control': 'public, max-age=3600' },
          cacheTags: ".headers[\"x-tenant-id\"], 'auth'"
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with custom header
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/auth',
        headers: {
          'x-tenant-id': 'tenant-123'
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'tenant-123,auth')
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
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using multiple headers in cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/api/multi-header`,
          headers: { 'cache-control': 'public, max-age=3600' },
          cacheTags: ".headers[\"x-tenant-id\"], .headers[\"x-user-id\"], 'api'"
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with multiple custom headers
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/multi-header',
        headers: {
          'x-tenant-id': 'tenant-123',
          'x-user-id': 'user-456'
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'tenant-123,user-456,api')
      await res.body.dump()
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
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using a combination of sources for cache tags
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/users/:userId/products`,
          headers: { 'cache-control': 'public, max-age=3600' },
          cacheTags: ".headers[\"x-tenant-id\"], 'user-' + .params.userId, .querystring.category"
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with headers, params, and querystring values
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/users/123/products?category=electronics',
        headers: {
          'x-tenant-id': 'tenant-abc'
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'tenant-abc,user-123,electronics')
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
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using lowercase header names in the expression
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/api/case-insensitive`,
          headers: { 'cache-control': 'public, max-age=3600' },
          cacheTags: '.headers["x-tenant-id"]'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with mixed-case header names
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/case-insensitive',
        headers: {
          'X-Tenant-ID': 'tenant-xyz' // Mixed case
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'tenant-xyz')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
