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
      // Create agent with our interceptor with ignoreTrailingSlash enabled
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/api/users', cacheControl: 'no-store' }
      ], { ignoreTrailingSlash: true })

      const composedAgent = agent.compose(interceptor)

      // With ignoreTrailingSlash enabled, both should match
      const resWithoutSlash = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      assert.strictEqual(resWithoutSlash.headers['cache-control'], 'no-store')
      await resWithoutSlash.body.dump()

      const resWithSlash = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users/'
      })

      assert.strictEqual(resWithSlash.headers['cache-control'], 'no-store')
      await resWithSlash.body.dump()

      // Create agent with our interceptor with ignoreTrailingSlash disabled
      const agent2 = new Agent()
      const interceptor2 = createInterceptor([
        { routeToMatch: '/api/users', cacheControl: 'no-store' }
      ], { ignoreTrailingSlash: false })

      const composedAgent2 = agent2.compose(interceptor2)

      // With ignoreTrailingSlash disabled, only the exact path should match
      const resWithoutSlash2 = await composedAgent2.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      assert.strictEqual(resWithoutSlash2.headers['cache-control'], 'no-store')
      await resWithoutSlash2.body.dump()

      const resWithSlash2 = await composedAgent2.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users/'
      })

      assert.strictEqual(resWithSlash2.headers['cache-control'], undefined)
      await resWithSlash2.body.dump()
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
      // Create agent with our interceptor with caseSensitive disabled
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/api/Users', cacheControl: 'no-store' }
      ], { caseSensitive: false })

      const composedAgent = agent.compose(interceptor)

      // With caseSensitive disabled, case should be ignored
      const resLowercase = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      assert.strictEqual(resLowercase.headers['cache-control'], 'no-store')
      await resLowercase.body.dump()

      const resUppercase = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/Users'
      })

      assert.strictEqual(resUppercase.headers['cache-control'], 'no-store')
      await resUppercase.body.dump()

      // Create agent with our interceptor with caseSensitive enabled
      const agent2 = new Agent()
      const interceptor2 = createInterceptor([
        { routeToMatch: '/api/Users', cacheControl: 'no-store' }
      ], { caseSensitive: true })

      const composedAgent2 = agent2.compose(interceptor2)

      // With caseSensitive enabled, only the exact case should match
      const resLowercase2 = await composedAgent2.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      assert.strictEqual(resLowercase2.headers['cache-control'], undefined)
      await resLowercase2.body.dump()

      const resUppercase2 = await composedAgent2.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/Users'
      })

      assert.strictEqual(resUppercase2.headers['cache-control'], 'no-store')
      await resUppercase2.body.dump()
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
      // Create agent with our interceptor with ignoreDuplicateSlashes enabled
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/api/users', cacheControl: 'no-store' }
      ], { ignoreDuplicateSlashes: true })

      const composedAgent = agent.compose(interceptor)

      // With ignoreDuplicateSlashes enabled, duplicate slashes should be ignored
      const resNormal = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      assert.strictEqual(resNormal.headers['cache-control'], 'no-store')
      await resNormal.body.dump()

      const resDuplicateSlashes = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api//users'
      })

      assert.strictEqual(resDuplicateSlashes.headers['cache-control'], 'no-store')
      await resDuplicateSlashes.body.dump()

      // Create agent with our interceptor with ignoreDuplicateSlashes disabled
      const agent2 = new Agent()
      const interceptor2 = createInterceptor([
        { routeToMatch: '/api/users', cacheControl: 'no-store' }
      ], { ignoreDuplicateSlashes: false })

      const composedAgent2 = agent2.compose(interceptor2)

      // With ignoreDuplicateSlashes disabled, only the exact path should match
      const resNormal2 = await composedAgent2.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/users'
      })

      assert.strictEqual(resNormal2.headers['cache-control'], 'no-store')
      await resNormal2.body.dump()

      const resDuplicateSlashes2 = await composedAgent2.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api//users'
      })

      assert.strictEqual(resDuplicateSlashes2.headers['cache-control'], undefined)
      await resDuplicateSlashes2.body.dump()
    } finally {
      server.close()
    }
  })
})
