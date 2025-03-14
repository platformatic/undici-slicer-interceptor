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
      name: 'Sample Product',
      tags: ['electronics', 'laptop']
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
      console.log('Making request to:', serverUrl + '/api/products/abc-123')
      const response = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/abc-123'
      })

      console.log('Response received, status:', response.statusCode)

      // Read the response to completion
      const body = await response.body.text()
      console.log('Response body:', body)
      console.log('Response headers:', response.headers)

      // Headers in the response should include both types
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-product-id'], 'abc-123')
      assert.strictEqual(response.headers['x-response-id'], 'prod-123')
    } finally {
      server.close()
    }
  })

  test('should handle multiple values from response body arrays', async () => {
    // Sample response with array
    const responseData = [
      { id: 'prod-1', name: 'Product 1' },
      { id: 'prod-2', name: 'Product 2' }
    ]

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
      // Create agent with interceptor
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-count': { fgh: '.response.body | length' },  // should be 2
            'x-cache-tags': { fgh: "'product', .response.body[].id" }  // should be product,prod-1,prod-2
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Make a request
      const response = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products'
      })

      // Read the response to completion
      await response.body.text()

      // Headers in the response should include both types
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-count'], '2')
      assert.strictEqual(response.headers['x-cache-tags'], 'product,prod-1,prod-2')
    } finally {
      server.close()
    }
  })
})
