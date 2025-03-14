import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - response headers', () => {
  test('should set headers from response body', async () => {
    // Sample response data
    const responseData = {
      id: 'prod-123',
      name: 'Sample Product'
    }

    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(responseData))
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-product-id': { fgh: '.params.productId' },  // from request
            'x-response-id': { fgh: '.response.body.id' }  // from response body
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Make a request
      const response = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/abc-123'
      })

      // Verify the headers
      console.log('Response headers:', response.headers)
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-product-id'], 'abc-123')
      assert.strictEqual(response.headers['x-response-id'], 'prod-123')

      // Verify body is unmodified
      const body = await response.body.json()
      assert.deepStrictEqual(body, responseData)
    } finally {
      server.close()
    }
  })
})
