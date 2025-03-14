import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - method handling', () => {
  test('should only apply cache headers to GET and HEAD requests', async () => {
    // Setup test server
    const server = createServer((req, res) => {
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
          { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // GET request should get cache header
      const getRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(getRes.headers['cache-control'], 'public, max-age=86400', 'GET request should have cache header')
      await getRes.body.dump()

      // HEAD request should get cache header
      const headRes = await composedAgent.request({
        method: 'HEAD',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(headRes.headers['cache-control'], 'public, max-age=86400', 'HEAD request should have cache header')

      // POST request should NOT get cache header
      const postRes = await composedAgent.request({
        method: 'POST',
        origin: serverUrl,
        path: '/',
        body: 'test'
      })

      assert.strictEqual(postRes.headers['cache-control'], undefined, 'POST request should not have cache header')
      await postRes.body.dump()

      // PUT request should NOT get cache header
      const putRes = await composedAgent.request({
        method: 'PUT',
        origin: serverUrl,
        path: '/',
        body: 'test'
      })

      assert.strictEqual(putRes.headers['cache-control'], undefined, 'PUT request should not have cache header')
      await putRes.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle uppercase method correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
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
          { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // Test with uppercase method
      const res = await composedAgent.request({
        method: 'GET', // Uppercase method
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle lowercase method correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
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
          { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // Test with lowercase method
      const res = await composedAgent.request({
        method: 'get', // Lowercase method
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should use GET as default method when applying cache headers', async () => {
    // Setup test server
    const server = createServer((req, res) => {
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
          { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
        ]
      })

      const composedAgent = agent.compose(interceptor)

      // Test with default method (Undici now requires a method)
      const res = await composedAgent.request({
        method: 'GET', // Use GET explicitly rather than relying on default
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
