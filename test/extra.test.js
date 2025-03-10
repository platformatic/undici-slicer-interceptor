import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - advanced tests', () => {
  test('should support regex-like patterns for route matching', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using more complex patterns
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/static/img', cacheControl: 'public, max-age=604800' }, // 1 week for images
        { routeToMatch: '/static', cacheControl: 'public, max-age=86400' }, // 1 day for other static
        { routeToMatch: '/api/v1/cache', cacheControl: 'public, max-age=3600' }, // cacheable API
        { routeToMatch: '/api', cacheControl: 'no-store' } // most API calls
      ])

      const composedAgent = agent.compose(interceptor)

      // Test more specific route should take precedence (static/img)
      const imgRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/static/img/logo.png'
      })

      assert.strictEqual(imgRes.headers['cache-control'], 'public, max-age=604800')
      await imgRes.body.dump()

      // Test cacheable API route
      const cacheableApiRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/v1/cache/data'
      })

      assert.strictEqual(cacheableApiRes.headers['cache-control'], 'public, max-age=3600')
      await cacheableApiRes.body.dump()

      // Test normal API route
      const apiRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/v1/users'
      })

      assert.strictEqual(apiRes.headers['cache-control'], 'no-store')
      await apiRes.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle invalid rules gracefully', async () => {
    // Test array validation
    try {
      createInterceptor('not-an-array')
      assert.fail('Should have thrown an error for non-array rules')
    } catch (err) {
      assert.strictEqual(err.message, 'Rules must be an array')
    }

    // Test rule validation - missing routeToMatch
    try {
      createInterceptor([{ cacheControl: 'no-store' }])
      assert.fail('Should have thrown an error for missing routeToMatch')
    } catch (err) {
      assert.strictEqual(err.message, 'Each rule must have a routeToMatch string')
    }

    // Test rule validation - missing cacheControl
    try {
      createInterceptor([{ routeToMatch: '/api' }])
      assert.fail('Should have thrown an error for missing cacheControl')
    } catch (err) {
      assert.strictEqual(err.message, 'Each rule must have a cacheControl string')
    }
  })
})
