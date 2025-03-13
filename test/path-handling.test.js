import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - path handling', () => {
  test('should handle root path correctly', async () => {
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

      // Make a request with the shortest valid path - just "/"
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      // Root path should match '/'
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle path without querystring correctly', async () => {
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

      // Test with path that doesn't have a query string
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should handle path with querystring correctly', async () => {
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

      // Make a request with a querystring to test path extraction
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/?param=value'
      })

      // Should extract path from querystring and match '/'
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should properly handle semicolon delimited querystrings', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor with semicolon delimiter option
      const agent = new Agent()
      const interceptor = createInterceptor(
        [{ routeToMatch: `${hostname}/api/*`, cacheControl: 'no-store' }],
        { useSemicolonDelimiter: true }
      )

      const composedAgent = agent.compose(interceptor)

      // Make a request with a semicolon-delimited querystring
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/data?param1=value1;param2=value2'
      })

      // Should match /api/* despite the querystring
      assert.strictEqual(res.headers['cache-control'], 'no-store')
      await res.body.dump()
    } finally {
      server.close()
    }
  })

  test('should support regex-like patterns for route matching', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using more complex patterns
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: `${hostname}/static/img/*`, cacheControl: 'public, max-age=604800' }, // 1 week for images
        { routeToMatch: `${hostname}/static/*`, cacheControl: 'public, max-age=86400' }, // 1 day for other static
        { routeToMatch: `${hostname}/api/v1/cache/*`, cacheControl: 'public, max-age=3600' }, // cacheable API
        { routeToMatch: `${hostname}/api/*`, cacheControl: 'no-store' } // most API calls
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

  test('should exercise edge cases in path matching', async () => {
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
        { routeToMatch: `${hostname}/nonexistent`, cacheControl: 'public, max-age=86400' }
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
