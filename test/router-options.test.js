import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - router options', () => {
  test('should respect ignoreTrailingSlash option', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor with ignoreTrailingSlash option
      const agent = new Agent()
      const interceptor = createInterceptor(
        [
          { routeToMatch: `${hostname}/api/users`, headers: { 'cache-control': 'public, max-age=86400' } }
        ],
        {
          ignoreTrailingSlash: true
        }
      )

      const composedAgent = agent.compose(interceptor)

      // Test without trailing slash
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.dump()

      // Test with trailing slash
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users/'
      })

      // Should match because of ignoreTrailingSlash option
      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=86400')
      await res2.body.dump()
    } finally {
      server.close()
    }
  })

  test('should respect caseSensitive option', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor with caseSensitive: false
      const agent = new Agent()
      const interceptor = createInterceptor(
        [
          { routeToMatch: `${hostname}/api/Users`, headers: { 'cache-control': 'public, max-age=86400' } }
        ],
        {
          caseSensitive: false
        }
      )

      const composedAgent = agent.compose(interceptor)

      // Test with exact case
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/Users'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.dump()

      // Test with different case
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      // Should match because of caseSensitive: false
      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=86400')
      await res2.body.dump()
    } finally {
      server.close()
    }
  })

  test('should respect ignoreDuplicateSlashes option', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor with ignoreDuplicateSlashes option
      const agent = new Agent()
      const interceptor = createInterceptor(
        [
          { routeToMatch: `${hostname}/api/data`, headers: { 'cache-control': 'public, max-age=86400' } }
        ],
        {
          ignoreDuplicateSlashes: true
        }
      )

      const composedAgent = agent.compose(interceptor)

      // Test without duplicate slashes
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/data'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      await res1.body.dump()

      // Test with duplicate slashes
      const res2 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api//data'
      })

      // Should match because of ignoreDuplicateSlashes option
      assert.strictEqual(res2.headers['cache-control'], 'public, max-age=86400')
      await res2.body.dump()
    } finally {
      server.close()
    }
  })

  test('should provide all router options correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor with all options provided
      const agent = new Agent()
      const interceptor = createInterceptor(
        [
          { routeToMatch: `${hostname}/api/data`, headers: { 'cache-control': 'public, max-age=86400' } }
        ],
        {
          ignoreTrailingSlash: true,
          ignoreDuplicateSlashes: true,
          maxParamLength: 200,
          caseSensitive: false,
          useSemicolonDelimiter: true,
          cacheTagsHeader: 'x-custom-cache-tags'
        }
      )

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/data'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
