import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - function coverage', () => {
  test('should ensure 100% function coverage', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      // Add custom headers for testing
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      // Write multiple chunks to trigger onData multiple times
      res.write('hello ')
      setTimeout(() => {
        res.write('world')
        res.end()
      }, 10)
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create a basic interceptor
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      // Standard Agent
      const agent = new Agent()
      const composedAgent = agent.compose(interceptor)

      // Test the interceptor with basic GET request
      const res1 = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/',
        // Add a body to ensure onBodySent is called
        body: 'request-body'
      })

      assert.strictEqual(res1.headers['cache-control'], 'public, max-age=86400')
      
      // Collect the full response to make sure all events are triggered
      const body = await res1.body.text()
      assert.strictEqual(body, 'hello world')
    } finally {
      server.close()
    }
  })
})
