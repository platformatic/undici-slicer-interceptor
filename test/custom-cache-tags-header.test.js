import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - custom cache tags header', () => {
  test('should use custom header name for cache tags', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using a custom cache tags header
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [
          {
            routeToMatch: `${hostname}/products/:id`,
            headers: {
              'cache-control': 'public, max-age=3600',
              'x-custom-cache-tags': { fgh: "'product-' + .params.id, 'category-all'" },
            },
          },
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/products/123'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], undefined)
      assert.strictEqual(res.headers['x-custom-cache-tags'], 'product-123,category-all')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should respect existing custom cache tags header', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('x-custom-cache-tags', 'existing-tag')
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [
          {
            routeToMatch: `${hostname}/respect-existing`,
            headers: {
              'cache-control': 'public, max-age=3600',
              'x-custom-cache-tags': { fgh: "'should-not-appear'" },
            },
          },
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/respect-existing'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-custom-cache-tags'], 'existing-tag')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should use default header name when not specified', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor without specifying a custom cache tags header
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [
          {
            routeToMatch: `${hostname}/default-header`,
            headers: {
              'cache-control': 'public, max-age=3600',
              'x-cache-tags': { fgh: "'default-tag'" }
            }
          }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/default-header'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-cache-tags'], 'default-tag')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
