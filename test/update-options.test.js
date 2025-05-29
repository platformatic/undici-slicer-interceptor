import { describe, test } from 'node:test'
import assert from 'node:assert'
import { Agent, setGlobalDispatcher, request } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor, updateInterceptorOptions } from '../index.js'

describe('make-cacheable-interceptor - update options', () => {
  test('should update interceptor options', async (t) => {
    // Setup test server
    const server = createServer((req, res) => {
      res.end('hello world')
    })

    server.listen(0)
    await once(server, 'listening')

    t.after(() => { server.close() })

    const serverUrl = `http://localhost:${server.address().port}`
    const hostname = `localhost:${server.address().port}`

      // Create agent with our interceptor
   const agent = new Agent()
   const interceptor = createInterceptor({
     rules: [
       { routeToMatch: `${hostname}/test-1`, headers: { 'test-header': 'test-1' } },
       { routeToMatch: `${hostname}/test-2`, headers: { 'test-header': 'test-2' } }
     ]
   })

   const composedAgent = agent.compose(interceptor)
   setGlobalDispatcher(composedAgent)

   {
     const test1Res = await request({
       method: 'GET',
       origin: serverUrl,
       path: '/test-1'
     })

     assert.strictEqual(test1Res.headers['test-header'], 'test-1')
     await test1Res.body.dump()
   }

   updateInterceptorOptions(interceptor, {
     rules: [
       { routeToMatch: `${hostname}/test-1`, headers: { 'test-header': 'test-42' } },
       { routeToMatch: `${hostname}/test-3`, headers: { 'test-header': 'test-3' } }
     ]
   })

   {
     // Route config was modified
     const test1Res = await request({
       method: 'GET',
       origin: serverUrl,
       path: '/test-1'
     })

     assert.strictEqual(test1Res.headers['test-header'], 'test-42')
     await test1Res.body.dump()

     // Route config was removed
     const test2Res = await request({
       method: 'GET',
       origin: serverUrl,
       path: '/test-2'
     })

     assert.strictEqual(test2Res.headers['test-header'], undefined)
     await test2Res.body.dump()

     // Route config was added
     const test3Res = await request({
       method: 'GET',
       origin: serverUrl,
       path: '/test-3'
     })

     assert.strictEqual(test3Res.headers['test-header'], 'test-3')
     await test3Res.body.dump()
   }
  })
})
