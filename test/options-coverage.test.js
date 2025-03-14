import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - options coverage', () => {
  test('should provide all router options correctly', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

    try {
      // Create agent with our interceptor with all options provided
      const agent = new Agent()
      const interceptor = createInterceptor({
        rules: [
          {
            routeToMatch: `${hostname}/`,
            headers: { 'cache-control': 'public, max-age=86400' },
          },
        ],
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: true,
        maxParamLength: 200,
        caseSensitive: false,
        useSemicolonDelimiter: true
      })

      const composedAgent = agent.compose(interceptor)

      // Test request
      const res = await composedAgent.request({
        method: 'GET',
        origin: serverUrl,
        path: '/'
      })

      assert.strictEqual(res.headers['cache-control'], 'public, max-age=86400')
      await res.body.dump()
    } finally {
      server.close()
    }
  })
})
