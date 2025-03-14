import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'
import { parseRouteWithOrigin } from '../lib/router.js'

describe('make-cacheable-interceptor - protocol in route', () => {
  test('should correctly parse route with protocol', () => {
    // Test with http:// protocol
    const result1 = parseRouteWithOrigin('http://example.com/api/data')
    assert.deepStrictEqual(result1, {
      origin: 'example.com',
      path: '/api/data'
    })

    // Test with https:// protocol
    const result2 = parseRouteWithOrigin('https://example.com/api/data')
    assert.deepStrictEqual(result2, {
      origin: 'example.com',
      path: '/api/data'
    })

    // Test with protocol and port
    const result3 = parseRouteWithOrigin('https://example.com:3000/api/data')
    assert.deepStrictEqual(result3, {
      origin: 'example.com:3000',
      path: '/api/data'
    })
  })

  test('should match based on origin and path with protocol in route definition', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const agent = new Agent()

    try {
      // Create agent with our interceptor that includes protocol in the route
      const interceptor = createInterceptor([
        {
          routeToMatch: `http://localhost:${port}/api/*`,
          cacheControl: 'public, max-age=86400'
        },
        {
          routeToMatch: 'other.example.com/api/*',
          cacheControl: 'no-store'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with matching origin and path
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port}`,
        path: '/api/data'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.text()

      // Test with non-matching path
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port}`,
        path: '/other/path'
      })

      assert.strictEqual(res2.headers['cache-control'], undefined)
      await res2.body.text()

      // Test with different origin but with the same path
      const res3 = await composedAgent.request({
        method: 'GET',
        headers: {
          host: 'other.example.com'
        },
        origin: `http://localhost:${port}`, // Required by undici
        path: '/api/data'
      })

      // The Host header is prioritized over origin, so this should match the 'other.example.com' rule
      assert.strictEqual(res3.headers['cache-control'], 'no-store')
      await res3.body.text()
    } finally {
      // Close the server and agent first to prevent hanging
      await new Promise(resolve => server.close(resolve))
      await agent.close()
    }
  })

  test('should work with mixed route formats (with and without protocol)', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const agent = new Agent()

    try {
      // Create agent with our interceptor
      const interceptor = createInterceptor([
        {
          routeToMatch: `http://localhost:${port}/api/*`,
          cacheControl: 'public, max-age=86400'
        },
        {
          routeToMatch: `localhost:${port}/static/*`,
          cacheControl: 'public, max-age=3600'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with matching origin and path for route with protocol
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port}`,
        path: '/api/data'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.text()

      // Test with matching origin and path for route without protocol
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port}`,
        path: '/static/image.jpg'
      })

      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=3600')
      await res2.body.text()
    } finally {
      // Close the server and agent first to prevent hanging
      await new Promise(resolve => server.close(resolve))
      await agent.close()
    }
  })
})
