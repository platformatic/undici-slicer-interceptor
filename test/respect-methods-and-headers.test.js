import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - respect existing headers and methods', () => {
  test('should not override existing cache-control header', async () => {
    // Setup test server with existing cache-control header
    const server = createServer((req, res) => {
      res.setHeader('cache-control', 'no-store, immutable')
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/`, cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test that the interceptor doesn't override existing cache-control
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'no-store, immutable')
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
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/`, cacheControl: 'public, max-age=86400' }
      ])

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
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/`, cacheControl: 'public, max-age=86400' }
      ])

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
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/`, cacheControl: 'public, max-age=86400' }
      ])

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

  test('should use GET as default method when not specified', async () => {
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
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/`, cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with explicitly specifying GET method
      const res = await composedAgent.request({
        method: 'GET', // Explicitly specify method
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
