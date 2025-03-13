import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'
import { parseRouteWithOrigin, extractOrigin } from '../lib/router.js'

describe('make-cacheable-interceptor - origin in route format', () => {
  test('should correctly parse route with origin', () => {
    // Test with simple hostname/path
    const result1 = parseRouteWithOrigin('example.com/api/data')
    assert.deepStrictEqual(result1, {
      origin: 'example.com',
      path: '/api/data'
    })

    // Test with hostname:port/path
    const result2 = parseRouteWithOrigin('example.com:3000/api/data')
    assert.deepStrictEqual(result2, {
      origin: 'example.com:3000',
      path: '/api/data'
    })

    // Test with protocol (should be ignored)
    const result3 = parseRouteWithOrigin('http://example.com:3000/api/data')
    assert.deepStrictEqual(result3, {
      origin: 'example.com:3000',
      path: '/api/data'
    })
  })

  test('should throw error for invalid route format', () => {
    assert.throws(() => {
      parseRouteWithOrigin('invalid-route-no-slash')
    }, /Invalid route format/)
  })

  test('should correctly extract origin from request options', () => {
    // Test with origin URL
    const result1 = extractOrigin({ origin: 'http://example.com:3000' })
    assert.strictEqual(result1.origin, 'example.com:3000')

    // Test with host header
    const result2 = extractOrigin({ headers: { host: 'example.com:3000' } })
    assert.strictEqual(result2.origin, 'example.com:3000')
    assert.strictEqual(result2.fromHostHeader, true)

    // Test with hostname and port
    const result3 = extractOrigin({ hostname: 'example.com', port: 3000 })
    assert.strictEqual(result3.origin, 'example.com:3000')
    assert.strictEqual(result3.fromHostHeader, false)
  })

  test('should match based on origin and path', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const myAgent = new Agent()

    try {
      // Create agent with our interceptor
      const interceptor = createInterceptor([
        {
          routeToMatch: `localhost:${port}/api/*`,
          cacheControl: 'public, max-age=86400'
        },
        {
          routeToMatch: 'other.example.com/api/*',
          cacheControl: 'no-store'
        }
      ])

      const composedAgent = myAgent.compose(interceptor)

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

      // Test with non-matching origin
      const res3 = await composedAgent.request({
        method: 'GET',
        headers: {
          host: 'other.example.com'
        },
        origin: `http://localhost:${port}`, // Required by undici
        path: '/api/data'
      })

      // Since we prioritize Host header over origin, this should use other.example.com
      assert.strictEqual(res3.headers['cache-control'], 'no-store')
      await res3.body.text()
    } finally {
      // Close the server and agent first to prevent hanging
      await new Promise(resolve => server.close(resolve))
      await myAgent.close()
    }
  })
})
