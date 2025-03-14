import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - headers with FGH', () => {
  test('should set headers using FGH expressions', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using FGH in headers
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/users/:userId`,
          headers: {
            'cache-control': 'private, max-age=3600',
            'x-user-route': 'true',
            'x-user-id': { fgh: '.params.userId' },
            'x-cache-tags': { fgh: "'user', 'user-' + .params.userId" }
          }
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/users/123'
      })

      assert.strictEqual(res.headers['cache-control'], 'private, max-age=3600')
      assert.strictEqual(res.headers['x-user-route'], 'true')
      assert.strictEqual(res.headers['x-user-id'], '123')
      assert.strictEqual(res.headers['x-cache-tags'], 'user,user-123')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle multiple FGH headers', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using multiple FGH headers
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=1800',
            'x-product-id': { fgh: '.params.productId' },
            'x-product-variant': { fgh: '.querystring.variant // "default"' },
            'x-cache-tags': { fgh: "'product', 'product-' + .params.productId, .querystring.variant // 'default'" }
          }
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request with query parameter
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/laptop-123?variant=premium'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=1800')
      assert.strictEqual(res.headers['x-product-id'], 'laptop-123')
      assert.strictEqual(res.headers['x-product-variant'], 'premium')
      assert.strictEqual(res.headers['x-cache-tags'], 'product,product-laptop-123,premium')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle request headers in FGH expressions', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using request headers in FGH
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/api/auth`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-tenant-echo': { fgh: '.headers["x-tenant-id"]' },
            'x-cache-tags': { fgh: ".headers[\"x-tenant-id\"], 'auth'" }
          }
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
      assert.strictEqual(res.headers['x-tenant-echo'], 'tenant-123')
      assert.strictEqual(res.headers['x-cache-tags'], 'tenant-123,auth')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle mixed regular and FGH headers', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using mixed header types
      const agent = new Agent()
      const interceptor = createInterceptor([
        {
          routeToMatch: `${hostname}/mixed/*`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-static': 'static-value',
            'x-dynamic': { fgh: "'dynamic-' + .params[0]" },
            'x-cache-tags': { fgh: "'mixed', 'pattern-' + .params[0]" }
          }
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/mixed/test'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-static'], 'static-value')
      assert.strictEqual(res.headers['x-dynamic'], 'dynamic-test')
      assert.strictEqual(res.headers['x-cache-tags'], 'mixed,pattern-test')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  // Other tests...
})
