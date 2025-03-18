import { test } from 'node:test'
import assert from 'node:assert'
import { createServer } from 'node:http'
import { Agent, request } from 'undici'
import { createInterceptor } from '../index.js'

test('should parse response body as JSON only when content-type is application/json', async (t) => {
  // Create a server that responds with different content types
  const server = createServer((req, res) => {
    const { url } = req

    // JSON response
    if (url === '/json') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ key: 'value' }))
    } else if (url === '/text') {
      // Text response
      res.setHeader('content-type', 'text/plain')
      res.end('{"key": "value"}') // Valid JSON content but text/plain content-type
    } else if (url === '/nocontenttype') {
      // No content-type response
      res.end('{"key": "value"}') // Valid JSON content but no content-type
    }
  })

  // Start the server and get its port
  server.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  const port = server.address().port

  // Cleanup function
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
  })

  // Configure the interceptor with the specific port
  const rules = [
    {
      routeToMatch: `localhost:${port}/*`,
      headers: {
        // Try to access response body for all routes
        'x-response-key': { fgh: '.response.body.key' }
      },
      // Explicitly mark this rule as needing response body access
      needsResponseBodyAccess: true
    }
  ]

  const agent = new Agent()
  t.after(async () => {
    await agent.close()
  })

  const interceptor = createInterceptor({ rules })
  const composedAgent = agent.compose(interceptor)

  // Test with JSON content-type
  const jsonRes = await request(`http://localhost:${port}/json`, {
    method: 'GET',
    dispatcher: composedAgent
  })

  // Should have successfully parsed and accessed response body
  assert.strictEqual(jsonRes.headers['x-response-key'], 'value')

  // Test with text/plain content-type
  const textRes = await request(`http://localhost:${port}/text`, {
    method: 'GET',
    dispatcher: composedAgent
  })

  // Should NOT have parsed body despite being valid JSON
  assert.strictEqual(textRes.headers['x-response-key'], undefined)

  // Test with no content-type
  const noContentTypeRes = await request(`http://localhost:${port}/nocontenttype`, {
    method: 'GET',
    dispatcher: composedAgent
  })

  // Should NOT have parsed body
  assert.strictEqual(noContentTypeRes.headers['x-response-key'], undefined)
})
