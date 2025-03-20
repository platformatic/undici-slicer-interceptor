import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - product and SKUs cache tags', () => {
  test('should add x-cache-tags header with product ID and SKU IDs from request body', async () => {
    // Setup test server to accept GET requests and return a specified response
    const server = createServer((req, res) => {
      // Extract product ID and create a response with predefined SKUs
      const productId = req.url.split('/').pop()
      const responseBody = JSON.stringify({
        id: productId,
        skus: [
          { id: 'SKU123', name: 'Small' },
          { id: 'SKU456', name: 'Medium' },
          { id: 'SKU789', name: 'Large' }
        ],
        metadata: {
          category: 'clothing'
        }
      })
      
      res.setHeader('Content-Type', 'application/json')
      res.end(responseBody)
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor using both path parameter and body array data
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [{
          routeToMatch: `${hostname}/api/products/:id`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-cache-tags': { 
              fgh: '"product-" + .params.id, if .response.body.skus then "sku-" + .response.body.skus[].id else empty end' 
            }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test data with product ID and multiple SKUs
      const requestBody = {
        skus: [
          { id: 'SKU123', name: 'Small' },
          { id: 'SKU456', name: 'Medium' },
          { id: 'SKU789', name: 'Large' }
        ],
        metadata: {
          category: 'clothing'
        }
      }

      // Test request with GET method
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/P12345',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      // The x-cache-tags header should contain the product ID and all SKU IDs
      assert.strictEqual(
        res.headers['x-cache-tags'], 
        'product-P12345,sku-SKU123,sku-SKU456,sku-SKU789'
      )

      // Read the response body to ensure everything completes
      await res.body.text()
    } finally {
      server.close()
    }
  })

  test('should handle product with no SKUs correctly', async () => {
    // Setup test server for empty SKUs case
    const server = createServer((req, res) => {
      const productId = req.url.split('/').pop()
      const responseBody = JSON.stringify({
        id: productId,
        skus: [],
        metadata: {
          category: 'digital'
        }
      })
      
      res.setHeader('Content-Type', 'application/json')
      res.end(responseBody)
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
          routeToMatch: `${hostname}/api/products/:id`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-cache-tags': { 
              fgh: '"product-" + .params.id, if .response.body.skus then "sku-" + .response.body.skus[].id else empty end' 
            }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test data with product ID but empty SKUs array
      const requestBody = {
        skus: [],
        metadata: {
          category: 'digital'
        }
      }

      // Test request with GET method
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/DIGITAL001',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      // The x-cache-tags header should only contain the product ID
      assert.strictEqual(
        res.headers['x-cache-tags'], 
        'product-DIGITAL001'
      )

      // Read the response body to ensure everything completes
      await res.body.text()
    } finally {
      server.close()
    }
  })

  test('should handle product with missing SKUs field correctly', async () => {
    // Setup test server for missing SKUs field case
    const server = createServer((req, res) => {
      const productId = req.url.split('/').pop()
      const responseBody = JSON.stringify({
        id: productId,
        metadata: {
          category: 'service'
        }
        // No skus field
      })
      
      res.setHeader('Content-Type', 'application/json')
      res.end(responseBody)
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
          routeToMatch: `${hostname}/api/products/:id`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-cache-tags': { 
              fgh: '"product-" + .params.id, if .response.body.skus then "sku-" + .response.body.skus[].id else empty end' 
            }
          }
        }]
      })

      const composedAgent = agent.compose(interceptor)

      // Test data with product ID but no SKUs field
      const requestBody = {
        metadata: {
          category: 'service'
        }
        // No skus field
      }

      // Test request with GET method
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/api/products/SERVICE001',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=3600')
      // For missing skus field, verify x-cache-tags exists with product ID
      assert.strictEqual(
        res.headers['x-cache-tags'],
        'product-SERVICE001'
      )

      // Read the response body to ensure everything completes
      await res.body.text()
    } finally {
      server.close()
    }
  })
})
