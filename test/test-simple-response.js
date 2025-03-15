import { createServer } from 'node:http'
import { Agent } from 'undici'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'
import abstractLogging from 'abstract-logging'

// Create logger with console.log
const logger = {
  ...abstractLogging,
  debug: console.log,
  info: console.log,
  error: console.error,
  warn: console.warn
}

// Setup test server that returns JSON
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ id: 'product-123', name: 'Test Product' }))
})

server.listen(0)
await once(server, 'listening')

const serverUrl = `http://localhost:${server.address().port}`
const hostname = `localhost:${server.address().port}`

try {
  // Create agent with our interceptor
  const agent = new Agent()
  const interceptor = createInterceptor({
    logger,
    rules: [{
      routeToMatch: `${hostname}/api/products/:productId`,
      headers: {
        'cache-control': 'public, max-age=1800',
        'x-product-id': { fgh: '.params.productId' }, // Request-based
        'x-product-real-id': { fgh: '.response.body.id' }, // Response-based
        'x-cache-tags': { fgh: "'product', 'product-' + .response.body.id" } // Response-based
      }
    }]
  })

  const composedAgent = agent.compose(interceptor)

  // Test request
  const res = await composedAgent.request({
    method: 'GET',
    origin: serverUrl,
    path: '/api/products/123'
  })

  console.log('Headers:', res.headers)
  
  // Read the body to ensure everything completes
  const body = await res.body.text()
  console.log('Body:', body)
} finally {
  server.close()
}
