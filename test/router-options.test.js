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

    try {
      // Create agent with our interceptor with ignoreTrailingSlash option
      const agent = new Agent()
      const interceptor = createInterceptor(
        [{ routeToMatch: '/api', cacheControl: 'public, max-age=86400' }],
        { ignoreTrailingSlash: true }
      )

      const composedAgent = agent.compose(interceptor)

      // Test without trailing slash
      const noSlashRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api'
      })

      assert.strictEqual(noSlashRes.headers['cache-control'], 'public, max-age=86400')
      await noSlashRes.body.dump()

      // Test with trailing slash (should still match with ignoreTrailingSlash: true)
      const withSlashRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/'
      })

      assert.strictEqual(withSlashRes.headers['cache-control'], 'public, max-age=86400')
      await withSlashRes.body.dump()

      // Now test with ignoreTrailingSlash: false
      const strictInterceptor = createInterceptor(
        [{ routeToMatch: '/api', cacheControl: 'public, max-age=86400' }],
        { ignoreTrailingSlash: false }
      )

      const strictAgent = agent.compose(strictInterceptor)

      // Test without trailing slash
      const strictNoSlashRes = await strictAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api'
      })

      assert.strictEqual(strictNoSlashRes.headers['cache-control'], 'public, max-age=86400')
      await strictNoSlashRes.body.dump()

      // Test with trailing slash (should NOT match with ignoreTrailingSlash: false)
      const strictWithSlashRes = await strictAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/'
      })

      assert.strictEqual(strictWithSlashRes.headers['cache-control'], undefined)
      await strictWithSlashRes.body.dump()
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

    try {
      // Create agent with our interceptor with caseSensitive: false
      const agent = new Agent()
      const interceptor = createInterceptor(
        [{ routeToMatch: '/Api', cacheControl: 'public, max-age=86400' }],
        { caseSensitive: false }
      )

      const composedAgent = agent.compose(interceptor)

      // Test with exact case
      const exactCaseRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/Api'
      })

      assert.strictEqual(exactCaseRes.headers['cache-control'], 'public, max-age=86400')
      await exactCaseRes.body.dump()

      // Test with different case (should still match with caseSensitive: false)
      const differentCaseRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api'
      })

      assert.strictEqual(differentCaseRes.headers['cache-control'], 'public, max-age=86400')
      await differentCaseRes.body.dump()

      // Now test with caseSensitive: true (default)
      const strictInterceptor = createInterceptor(
        [{ routeToMatch: '/Api', cacheControl: 'public, max-age=86400' }],
        { caseSensitive: true }
      )

      const strictAgent = agent.compose(strictInterceptor)

      // Test with exact case
      const strictExactCaseRes = await strictAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/Api'
      })

      assert.strictEqual(strictExactCaseRes.headers['cache-control'], 'public, max-age=86400')
      await strictExactCaseRes.body.dump()

      // Test with different case (should NOT match with caseSensitive: true)
      const strictDifferentCaseRes = await strictAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api'
      })

      assert.strictEqual(strictDifferentCaseRes.headers['cache-control'], undefined)
      await strictDifferentCaseRes.body.dump()
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

    try {
      // Create agent with our interceptor with ignoreDuplicateSlashes: true
      const agent = new Agent()
      const interceptor = createInterceptor(
        [{ routeToMatch: '/api/users', cacheControl: 'public, max-age=86400' }],
        { ignoreDuplicateSlashes: true }
      )

      const composedAgent = agent.compose(interceptor)

      // Test with normal path
      const normalPathRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      assert.strictEqual(normalPathRes.headers['cache-control'], 'public, max-age=86400')
      await normalPathRes.body.dump()

      // Test with duplicate slashes (should still match with ignoreDuplicateSlashes: true)
      const duplicateSlashesRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api//users'
      })

      assert.strictEqual(duplicateSlashesRes.headers['cache-control'], 'public, max-age=86400')
      await duplicateSlashesRes.body.dump()

      // Now test with ignoreDuplicateSlashes: false (default)
      const strictInterceptor = createInterceptor(
        [{ routeToMatch: '/api/users', cacheControl: 'public, max-age=86400' }],
        { ignoreDuplicateSlashes: false }
      )

      const strictAgent = agent.compose(strictInterceptor)

      // Test with normal path
      const strictNormalPathRes = await strictAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      assert.strictEqual(strictNormalPathRes.headers['cache-control'], 'public, max-age=86400')
      await strictNormalPathRes.body.dump()

      // Test with duplicate slashes (should NOT match with ignoreDuplicateSlashes: false)
      const strictDuplicateSlashesRes = await strictAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api//users'
      })

      assert.strictEqual(strictDuplicateSlashesRes.headers['cache-control'], undefined)
      await strictDuplicateSlashesRes.body.dump()
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

    try {
      // Create agent with our interceptor with all custom options
      const agent = new Agent()
      const interceptor = createInterceptor(
        [{ routeToMatch: '/api', cacheControl: 'public, max-age=86400' }],
        {
          ignoreTrailingSlash: true,
          ignoreDuplicateSlashes: true,
          maxParamLength: 200, // Custom value
          caseSensitive: false,
          useSemicolonDelimiter: true
        }
      )

      const composedAgent = agent.compose(interceptor)

      // Test with various paths that should all match with our custom options
      const normalPathRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api'
      })
      assert.strictEqual(normalPathRes.headers['cache-control'], 'public, max-age=86400')
      await normalPathRes.body.dump()

      // With trailing slash
      const trailingSlashRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/'
      })
      assert.strictEqual(trailingSlashRes.headers['cache-control'], 'public, max-age=86400')
      await trailingSlashRes.body.dump()

      // With duplicate slashes
      const duplicateSlashesRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/'
      })
      assert.strictEqual(duplicateSlashesRes.headers['cache-control'], 'public, max-age=86400')
      await duplicateSlashesRes.body.dump()

      // With different case
      const differentCaseRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/API'
      })
      assert.strictEqual(differentCaseRes.headers['cache-control'], 'public, max-age=86400')
      await differentCaseRes.body.dump()

      // With semicolon query delimiter
      const semicolonRes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api?param1=value1;param2=value2'
      })
      assert.strictEqual(semicolonRes.headers['cache-control'], 'public, max-age=86400')
      await semicolonRes.body.dump()
    } finally {
      server.close()
    }
  })
})
