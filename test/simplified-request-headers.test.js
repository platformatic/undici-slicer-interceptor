import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - simplified approach with request headers', () => {
  test('should set headers from request data', async () => {
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
            'x-product-id': { fgh: '.params.productId' }  // from request
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
      
      // Read the response body
      const body = await response.body.text()
      console.log('Response body:', body)
      console.log('Response headers:', response.headers)

      // Verify the headers from request data
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-product-id'], 'abc-123')
    } finally {
      server.close()
    }
  })

  test('should set headers based on query parameters', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('ok')
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
          routeToMatch: `${hostname}/api/search`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-query-term': { fgh: '.querystring.q' },
            'x-cache-tags': { fgh: "'search', 'term-' + .querystring.q" }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Make a request with query parameters
      console.log('Making request with query parameters')
      const response = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/search?q=laptop&page=1'
      })

      console.log('Response status:', response.statusCode)
      console.log('Response headers:', response.headers)
      await response.body.text()

      // Verify the headers from query parameters
      assert.strictEqual(response.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(response.headers['x-query-term'], 'laptop')
      assert.strictEqual(response.headers['x-cache-tags'], 'search,term-laptop')
    } finally {
      server.close()
    }
  })
})
