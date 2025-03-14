import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent, setGlobalDispatcher, request } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - multiple headers', () => {
  test('should add multiple headers based on headers object', async () => {
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
        { 
          routeToMatch: `${hostname}/static/*`, 
          headers: {
            'cache-control': 'public, max-age=86400',
            'x-custom-header': 'static-content',
            'content-type': 'application/json'
          }
        },
        { 
          routeToMatch: `${hostname}/api/*`, 
          headers: {
            'cache-control': 'no-store',
            'x-api-version': '1.0'
          }
        },
        {
          routeToMatch: `${hostname}/backward-compat`,
          cacheControl: 'private, max-age=3600'
        }
      ])

      const composedAgent = agent.compose(interceptor)
      setGlobalDispatcher(composedAgent)

      // Test static route
      const staticRes = await request({
        method: 'GET',
        origin: serverUrl,
        path: '/static/image.jpg'
      })

      assert.strictEqual(staticRes.headers['cache-control'], 'public, max-age=86400')
      assert.strictEqual(staticRes.headers['x-custom-header'], 'static-content')
      assert.strictEqual(staticRes.headers['content-type'], 'application/json')
      await staticRes.body.dump()

      // Test API route
      const apiRes = await request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/data'
      })

      assert.strictEqual(apiRes.headers['cache-control'], 'no-store')
      assert.strictEqual(apiRes.headers['x-api-version'], '1.0')
      await apiRes.body.dump()

      // Test backward compatibility
      const backwardRes = await request({
        method: 'GET',
        origin: serverUrl,
        path: '/backward-compat'
      })

      assert.strictEqual(backwardRes.headers['cache-control'], 'private, max-age=3600')
      await backwardRes.body.dump()

      // Test existing headers are preserved
      const server2 = createServer((req, res) => {
        // Send back with content-type header already set in response
        res.setHeader('content-type', 'application/xml')
        res.end('hello xml')
      })

      server2.listen(0)
      await once(server2, 'listening')

      const server2Url = `http://localhost:${server2.address().port}`
      const hostname2 = `localhost:${server2.address().port}`

      const interceptor2 = createInterceptor([
        { 
          routeToMatch: `${hostname2}/*`, 
          headers: {
            'cache-control': 'public, max-age=86400',
            'x-custom-header': 'test-value',
            'content-type': 'application/json'
          }
        }
      ])

      const composedAgent2 = agent.compose(interceptor2)
      setGlobalDispatcher(composedAgent2)

      const existingHeadersRes = await request({
        method: 'GET',
        origin: server2Url,
        path: '/'
      })

      // Our interceptor should add the custom header
      assert.strictEqual(existingHeadersRes.headers['x-custom-header'], 'test-value')
      // The cache-control should be added since it doesn't exist in the response
      assert.strictEqual(existingHeadersRes.headers['cache-control'], 'public, max-age=86400')
      // But it should not override content-type since it already exists in the response
      assert.strictEqual(existingHeadersRes.headers['content-type'], 'application/xml')
      await existingHeadersRes.body.dump()
      
      server2.close()

    } finally {
      server.close()
    }
  })

  test('should prioritize cacheControl over headers.cache-control when both are provided', async () => {
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
        { 
          routeToMatch: `${hostname}/mixed`, 
          headers: {
            'cache-control': 'public, max-age=86400',
            'x-custom-header': 'test'
          },
          cacheControl: 'private, max-age=60' // This should take precedence
        }
      ])

      const composedAgent = agent.compose(interceptor)
      setGlobalDispatcher(composedAgent)

      // Test route with both cacheControl and headers.cache-control
      const res = await request({
        method: 'GET',
        origin: serverUrl,
        path: '/mixed'
      })

      // cacheControl should take precedence over headers.cache-control
      assert.strictEqual(res.headers['cache-control'], 'private, max-age=60')
      // Other headers should still be set
      assert.strictEqual(res.headers['x-custom-header'], 'test')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
