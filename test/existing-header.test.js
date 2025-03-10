import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent, setGlobalDispatcher, request } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - existing headers', () => {
  test('should respect existing cache-control header', async () => {
    // Setup test server that returns its own cache-control header
    const server = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`

    try {
      // Create agent with our interceptor
      const agent = new Agent()
      const interceptor = createInterceptor([
        { routeToMatch: '/', cacheControl: 'public, max-age=86400' }
      ])

      const composedAgent = agent.compose(interceptor)
      setGlobalDispatcher(composedAgent)

      // Test that our interceptor respects the server's cache-control header
      const res = await request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'no-store')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
