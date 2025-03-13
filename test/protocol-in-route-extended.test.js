import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'
import { parseRouteWithOrigin } from '../lib/router.js'

describe('make-cacheable-interceptor - protocol in route extended', () => {
  test('should correctly parse route with http:// protocol', () => {
    // Test with http:// protocol
    const result = parseRouteWithOrigin('http://example.com/static/images/*')
    assert.deepStrictEqual(result, {
      origin: 'example.com',
      path: '/static/images/*'
    })
  })

  test('should match route with http:// protocol in the route pattern', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const port = server.address().port
    const agent = new Agent()

    try {
      // Create agent with interceptor that uses protocol in route
      const interceptor = createInterceptor([
        {
          routeToMatch: 'http://example.com/static/images/*',
          cacheControl: 'public, max-age=3600'
        }
      ])

      const composedAgent = agent.compose(interceptor)

      // Test with example.com using Host header
      const res = await composedAgent.request({
        method: 'GET',
        origin: `http://localhost:${port}`, // Required by undici
        headers: {
          host: 'example.com'
        },
        path: '/static/images/logo.png'
      })

      // Since we're using example.com in the Host header, it should match our rule
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600', 
        'Should match route with http:// protocol')
      await res.body.text()
    } finally {
      await new Promise(resolve => server.close(resolve))
      await agent.close()
    }
  })
})
