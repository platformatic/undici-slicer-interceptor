import { Agent } from 'undici'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createInterceptor } from './index.js'

// Setup test server
async function main() {
  const server = createServer((req, res) => {
    console.log('Server received request:', req.method, req.url)
    // HEAD requests don't have a body
    res.end()
  })

  server.listen(0)
  await once(server, 'listening')

  const serverPort = server.address().port
  const serverUrl = `http://localhost:${serverPort}`
  const hostname = `localhost:${serverPort}`

  console.log('Server listening on:', serverUrl)

  try {
    // Create agent with our interceptor
    const agent = new Agent()
    const interceptor = createInterceptor({
      rules: [
        { routeToMatch: `${hostname}/`, headers: { 'cache-control': 'public, max-age=86400' } }
      ],
      logger: {
        debug: console.log,
        error: console.error
      }
    })

    const composedAgent = agent.compose(interceptor)

    // Test HEAD request
    console.log('Sending HEAD request')
    const res = await composedAgent.request({
      method: 'HEAD',
      origin: serverUrl,
      path: '/'
    })

    console.log('Response status:', res.statusCode)
    console.log('Response headers:', res.headers)
  } finally {
    server.close()
  }
}

main().catch(console.error)
