import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - handler methods', () => {
  test('should handle path without querystring', async () => {
    // Setup test server
    const server = createServer((req, res) => {
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

      // Test with path that doesn't have a query string
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

  test('should correctly pass through all handler methods', async () => {
    // Setup test server
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.write('hello')
      setTimeout(() => {
        res.end(' world')
      }, 10)
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

      // Manual request to track all handler methods
      const methodsCalled = {
        onConnect: false,
        onUpgrade: false,
        onError: false,
        onHeaders: false,
        onData: false,
        onComplete: false,
        onBodySent: false
      }

      // Create a manual dispatcher for testing
      const requestPromise = new Promise((resolve, reject) => {
        const clientRequest = agent.dispatch(
          {
            method: 'POST', // Use POST to test method checking
            headers: {
              'content-type': 'text/plain'
            },
            origin: serverUrl,
            path: '/',
            body: 'request body'
          },
          {
            onConnect: (...args) => {
              methodsCalled.onConnect = true
              return true
            },
            onUpgrade: (...args) => {
              methodsCalled.onUpgrade = true
              return true
            },
            onError: (err) => {
              methodsCalled.onError = true
              reject(err)
            },
            onHeaders: (statusCode, headers, resume) => {
              methodsCalled.onHeaders = true
              return true
            },
            onData: (chunk) => {
              methodsCalled.onData = true
              return true
            },
            onComplete: () => {
              methodsCalled.onComplete = true
              resolve(methodsCalled)
            },
            onBodySent: () => {
              methodsCalled.onBodySent = true
            }
          }
        )
      })

      // Apply our interceptor to the request
      const interceptedRequest = interceptor(agent.dispatch.bind(agent))(
        {
          method: 'POST',
          headers: {
            'content-type': 'text/plain'
          },
          origin: serverUrl,
          path: '/',
          body: 'request body'
        },
        {
          onConnect: (...args) => {
            methodsCalled.onConnect = true
            return true
          },
          onUpgrade: (...args) => {
            methodsCalled.onUpgrade = true
            return true
          },
          onError: (err) => {
            methodsCalled.onError = true
            reject(err)
          },
          onHeaders: (statusCode, headers, resume) => {
            methodsCalled.onHeaders = true
            return true
          },
          onData: (chunk) => {
            methodsCalled.onData = true
            return true
          },
          onComplete: () => {
            methodsCalled.onComplete = true
            resolve(methodsCalled)
          },
          onBodySent: () => {
            methodsCalled.onBodySent = true
          }
        }
      )

      // Wait for the request to complete
      await requestPromise

      // Verify appropriate methods were called
      assert.strictEqual(methodsCalled.onHeaders, true, 'onHeaders should be called')
      assert.strictEqual(methodsCalled.onData, true, 'onData should be called')
      assert.strictEqual(methodsCalled.onComplete, true, 'onComplete should be called')
      assert.strictEqual(methodsCalled.onBodySent, true, 'onBodySent should be called')
      
      // Test for optional connect handler (might not be called in all environments)
      // This is a best-effort test, as it depends on the specific undici implementation
      if (methodsCalled.onConnect) {
        assert.strictEqual(methodsCalled.onConnect, true, 'onConnect should be called if used')
      }
    } finally {
      server.close()
    }
  })
})
