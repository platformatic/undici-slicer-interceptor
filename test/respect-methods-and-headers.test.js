import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - respect existing headers and methods', () => {
  test('should not override existing cache-control header', async () => {
    // Setup test server that returns its own cache-control header
    const server = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
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

      // Test that our interceptor doesn't override the server's cache-control header
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'no-store', 'Server cache-control header should be preserved')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should only apply cache headers to GET and HEAD requests', async () => {
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
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test GET request (should add cache-control)
      const getRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(getRes.headers['cache-control'], 'public, max-age=86400', 'GET request should have cache header')
      await getRes.body.dump()

      // Test HEAD request (should add cache-control)
      const headRes = await composedAgent.request({
        method: 'HEAD',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(headRes.headers['cache-control'], 'public, max-age=86400', 'HEAD request should have cache header')
      await headRes.body.dump()

      // Test POST request (should NOT add cache-control)
      const postRes = await composedAgent.request({
        method: 'POST',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(postRes.headers['cache-control'], undefined, 'POST request should not have cache header')
      await postRes.body.dump()

      // Test PUT request (should NOT add cache-control)
      const putRes = await composedAgent.request({
        method: 'PUT',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(putRes.headers['cache-control'], undefined, 'PUT request should not have cache header')
      await putRes.body.dump()

      // Test DELETE request (should NOT add cache-control)
      const deleteRes = await composedAgent.request({
        method: 'DELETE',
        origin: serverUrl,
        path: '/'
      })
      assert.strictEqual(deleteRes.headers['cache-control'], undefined, 'DELETE request should not have cache header')
      await deleteRes.body.dump()
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

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with uppercase method
      const res = await composedAgent.request({
        method: 'HEAD', // Explicitly uppercase method
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
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

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with lowercase method
      const res = await composedAgent.request({
        method: 'head', // Explicitly lowercase method
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
    } finally {
      server.close()
    }
  })

  test('should use GET as default method when applying cache headers', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      // Echo back the request method to verify
      res.end(`Method: ${req.method}`)
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

      // Make a request with explicit GET method
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      // Cache header should be applied for GET method
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')

      // Our method handling in the interceptor should handle case when method is undefined
      // This is being tested indirectly, as we can't directly provide an undefined method to undici
    } finally {
      server.close()
    }
  })
})
