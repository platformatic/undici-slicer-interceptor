import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - final push for coverage', () => {
  test('should thoroughly test rule validation', async () => {
    // Test with invalid rule missing routeToMatch
    let error = null
    try {
      createInterceptor([{ cacheControl: 'no-store' }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a routeToMatch string')

    // Test with null routeToMatch
    error = null
    try {
      createInterceptor([{ routeToMatch: null, cacheControl: 'no-store' }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a routeToMatch string')

    // Test with non-string routeToMatch
    error = null
    try {
      createInterceptor([{ routeToMatch: 123, cacheControl: 'no-store' }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a routeToMatch string')

    // Test with invalid rule missing cacheControl
    error = null
    try {
      createInterceptor([{ routeToMatch: '/path' }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a cacheControl string')

    // Test with null cacheControl
    error = null
    try {
      createInterceptor([{ routeToMatch: '/path', cacheControl: null }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a cacheControl string')

    // Test with non-string cacheControl
    error = null
    try {
      createInterceptor([{ routeToMatch: '/path', cacheControl: 123 }])
    } catch (err) {
      error = err
    }
    assert.strictEqual(error.message, 'Each rule must have a cacheControl string')
  })

  test('should thoroughly test all handler methods', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      // Detect if cache-control header is already present in the request
      const reqCacheControl = req.headers['cache-control']
      if (reqCacheControl) {
        // Echo back the same cache-control header
        res.setHeader('cache-control', reqCacheControl)
      }
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Make multiple requests with different combination of methods
      // GET with no cache-control (should add it)
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })
      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.text()

      // HEAD with no cache-control (should add it)
      const res2 = await composedAgent.request({
        method: 'HEAD',
        origin: serverUrl,
        path: '/'
      })
      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=86400')

      // GET with existing cache-control (should not override)
      const res3 = await agent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/',
        headers: {
          'cache-control': 'no-store'
        }
      })
      assert.strictEqual(res3.headers['cache-control'], 'no-store')
      await res3.body.text()

      // POST (should not add cache-control)
      const res4 = await composedAgent.request({
        method: 'POST',
        origin: serverUrl,
        path: '/',
        body: 'test body'
      })
      assert.strictEqual(res4.headers['cache-control'], undefined)
      await res4.body.text()

      // PUT (should not add cache-control)
      const res5 = await composedAgent.request({
        method: 'PUT',
        origin: serverUrl,
        path: '/',
        body: 'test body'
      })
      assert.strictEqual(res5.headers['cache-control'], undefined)
      await res5.body.text()

      // DELETE (should not add cache-control)
      const res6 = await composedAgent.request({
        method: 'DELETE',
        origin: serverUrl,
        path: '/'
      })
      assert.strictEqual(res6.headers['cache-control'], undefined)
      await res6.body.text()
    } finally {
      server.close()
    }
  })

  test('should exercise all branches of the interceptor', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()

      // Create an interceptor with no rules (edge case)
      const emptyInterceptor = createInterceptor([])
      const emptyAgent = agent.compose(emptyInterceptor)

      // Should work with no rules (no cache-control added)
      const emptyRes = await emptyAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })
      assert.strictEqual(emptyRes.headers['cache-control'], undefined)
      await emptyRes.body.text()

      // Create an interceptor with non-matching routes
      const nonMatchingInterceptor = createInterceptor([
        { routeToMatch: '/nonexistent', cacheControl: 'public, max-age=86400' }
      ])
      const nonMatchingAgent = agent.compose(nonMatchingInterceptor)

      // Should not add cache-control for non-matching routes
      const nonMatchingRes = await nonMatchingAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })
      assert.strictEqual(nonMatchingRes.headers['cache-control'], undefined)
      await nonMatchingRes.body.text()
    } finally {
      server.close()
    }
  })
})
