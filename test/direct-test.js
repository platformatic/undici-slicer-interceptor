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
  console.log(`Server received request for ${req.url}`)
  
  // Delay the response slightly to test chunking behavior
  setTimeout(() => {
    res.setHeader('Content-Type', 'application/json')
    
    // Send the response body
    res.end(JSON.stringify({ 
      id: 'product-123', 
      name: 'Test Product', 
      price: 99.99 
    }))
  }, 50)
})

server.listen(0)
await once(server, 'listening')

const port = server.address().port
const serverUrl = `http://localhost:${port}`
const hostname = `localhost:${port}`

console.log(`Server listening on ${serverUrl}`)

try {
  // Create agent with our interceptor
  const agent = new Agent()
  
  const interceptor = createInterceptor({
    logger,
    rules: [{
      routeToMatch: `${hostname}/api/products/:productId`,
      headers: {
        'cache-control': 'public, max-age=1800',
        'x-product-id': { fgh: '.params.productId' },
        'x-product-real-id': { fgh: '.response.body.id' },
        'x-product-name': { fgh: '.response.body.name' },
        'x-cache-tags': { fgh: "'product', 'product-' + .response.body.id" }
      }
    }]
  })

  const composedAgent = agent.compose(interceptor)

  // Test request
  console.log('Sending request...')
  const res = await composedAgent.request({
    method: 'GET',
    origin: serverUrl,
    path: '/api/products/123'
  })

  console.log('Response received')
  console.log('Status code:', res.statusCode)
  
  console.log('Headers:')
  Object.entries(res.headers).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`)
  })
  
  // Read the body
  const body = await res.body.text()
  console.log('Body:', body)
  
  // Verify the response headers
  if (res.headers['x-product-id'] === '123' && 
      res.headers['x-product-real-id'] === 'product-123' &&
      res.headers['x-product-name'] === 'Test Product' &&
      res.headers['x-cache-tags'] === 'product,product-product-123') {
    console.log('✅ SUCCESS: Response headers correctly processed!')
  } else {
    console.log('❌ FAILURE: Response headers not correctly processed')
    
    console.log('Expected:')
    console.log('  x-product-id: 123')
    console.log('  x-product-real-id: product-123')
    console.log('  x-product-name: Test Product')
    console.log('  x-cache-tags: product,product-product-123')
    
    console.log('Actual:')
    console.log('  x-product-id:', res.headers['x-product-id'])
    console.log('  x-product-real-id:', res.headers['x-product-real-id'])
    console.log('  x-product-name:', res.headers['x-product-name'])
    console.log('  x-cache-tags:', res.headers['x-cache-tags'])
  }
} finally {
  console.log('Closing server...')
  server.close()
}
