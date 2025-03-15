import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - access response headers in FGH', () => {
  test('should set headers using FGH expressions that access response headers', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('x-cache-tags', 'product')
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using FGH that accesses response headers
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-product-id': { fgh: '.params.productId' },
            'x-cache-tags2': { fgh: "'product', .response.headers['x-cache-tags']" }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/abc-123'
      })

      // Verify headers
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-product-id'], 'abc-123')
      assert.strictEqual(res.headers['x-cache-tags2'], 'product,product')

      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
