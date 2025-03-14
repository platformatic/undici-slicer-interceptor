import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - headers with FGH accessing response body', () => {
  test('should set headers using FGH expressions with response body access', async () => {
    // Sample response data
    const responseData = {
      id: 'prod-123',
      name: 'Sample Product',
      variants: [
        { id: 'v1', name: 'Small' },
        { id: 'v2', name: 'Medium' },
        { id: 'v3', name: 'Large' }
      ]
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
      // Create agent with our interceptor using FGH that accesses response body
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:productId`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-product-id': { fgh: '.params.productId' },
            'x-product-response-id': { fgh: '.response.body.id' },
            'x-cache-tags': { fgh: "'product', 'product-' + .response.body.id, 'variants-' + .response.body.variants.length" }
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

      // Read the body to ensure the interceptor has processed it
      const body = await res.body.json()
      
      // Verify all headers are set
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-product-id'], 'abc-123')
      assert.strictEqual(res.headers['x-product-response-id'], 'prod-123')
      assert.strictEqual(res.headers['x-cache-tags'], 'product,product-prod-123,variants-3')
      
      // Verify the body is intact
      assert.deepStrictEqual(body, responseData)
    } finally {
      server.close()
    }
  })

  test('should handle array responses with FGH expressions', async () => {
    // Sample response data with array
    const responseData = [
      { id: 'prod-1', name: 'Product 1' },
      { id: 'prod-2', name: 'Product 2' },
      { id: 'prod-3', name: 'Product 3' }
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
      // Create agent with our interceptor using FGH that accesses response body array
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-product-count': { fgh: '.response.body | .length // 0' },
            'x-cache-tags': { fgh: "'products', .response.body[].id" }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products'
      })

      // Read the body to ensure the interceptor has processed it
      const body = await res.body.json()
      
      // Verify all headers are set
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-product-count'], '3')
      assert.strictEqual(res.headers['x-cache-tags'], 'products,prod-1,prod-2,prod-3')
      
      // Verify the body is intact
      assert.deepStrictEqual(body, responseData)
    } finally {
      server.close()
    }
  })

  test('should mix request and response based rules correctly', async () => {
    // Sample response data
    const responseData = {
      id: 'prod-xyz',
      name: 'Custom Product',
      category: 'electronics'
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
      // Create agent with our interceptor using both request and response based FGH
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/custom/:customId`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-custom-id': { fgh: '.params.customId' },
            'x-custom-querystring': { fgh: '.querystring.type // "standard"' },
            'x-product-id': { fgh: '.response.body.id' },
            'x-cache-tags': { fgh: "'custom', 'custom-' + .params.customId, 'product-' + .response.body.id, 'category-' + .response.body.category" }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request with query parameter
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/custom/abc-special?type=premium'
      })

      // Read the body to ensure the interceptor has processed it
      const body = await res.body.json()
      
      // Verify all headers are set
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      assert.strictEqual(res.headers['x-custom-id'], 'abc-special')
      assert.strictEqual(res.headers['x-custom-querystring'], 'premium')
      assert.strictEqual(res.headers['x-product-id'], 'prod-xyz')
      assert.strictEqual(res.headers['x-cache-tags'], 'custom,custom-abc-special,product-prod-xyz,category-electronics')
      
      // Verify the body is intact
      assert.deepStrictEqual(body, responseData)
    } finally {
      server.close()
    }
  })

  test('should handle empty response bodies gracefully', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end('')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using FGH with response
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/empty`,
          headers: {
            'cache-control': 'public, max-age=60',
            'x-has-body': { fgh: '.response.body == null | not' },
            'x-cache-tags': { fgh: "'empty'" }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/empty'
      })

      // Read the body to ensure the interceptor has processed it
      const body = await res.body.text()
      
      // Verify headers
      assert.strictEqual(res.headers['cache-control'], 'public, max-age=60')
      assert.strictEqual(res.headers['x-has-body'], 'false')
      assert.strictEqual(res.headers['x-cache-tags'], 'empty')
      
      // Verify the body is empty
      assert.strictEqual(body, '')
    } finally {
      server.close()
    }
  })
})
