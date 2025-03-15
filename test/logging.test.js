import { describe, test } from 'node:test'
import { strict as assert } from 'node:assert'
import { createInterceptor } from '../index.js'
import { Agent, setGlobalDispatcher, request } from 'undici'
import pino from 'pino'
import { createServer } from 'node:http'

describe('Logging Tests', () => {
  test('should log creation of interceptor', async () => {
    // Create an array to store log records
    const logRecords = []

    // Create a simple in-memory destination for Pino
    const memoryDest = {
      write: (chunk) => {
        const logObj = JSON.parse(chunk)
        logRecords.push(logObj)
        return true
      }
    }

    // Create a Pino logger with our memory destination
    const logs = pino({ level: 'debug' }, memoryDest)

    // Create interceptor with logger
    createInterceptor({
      rules: [
        {
          routeToMatch: 'localhost:3000/test',
          headers: {
            'cache-control': 'public, max-age=3600'
          }
        }
      ],
      logger: logs
    })

    // Verify log messages
    assert.equal(logRecords.length > 0, true, 'No log messages were recorded')

    // Find specific log message
    const createMessage = logRecords.find(msg =>
      msg.msg && msg.msg.includes('Creating cacheable interceptor')
    )

    assert.ok(createMessage, 'Interceptor creation log message not found')
  })

  test('should log rule validation and router creation', async () => {
    // Create an array to store log records
    const logRecords = []

    // Create a simple in-memory destination for Pino
    const memoryDest = {
      write: (chunk) => {
        const logObj = JSON.parse(chunk)
        logRecords.push(logObj)
        return true
      }
    }

    // Create a Pino logger with our memory destination
    const logs = pino({ level: 'debug' }, memoryDest)

    // Create interceptor with logger
    createInterceptor({
      rules: [
        {
          routeToMatch: 'localhost:3000/test',
          headers: {
            'cache-control': 'public, max-age=3600'
          }
        }
      ],
      logger: logs
    })

    // Verify log messages

    // Check for validation log
    const validationMessage = logRecords.find(msg =>
      msg.msg && msg.msg.includes('Validating') && msg.msg.includes('rules')
    )
    assert.ok(validationMessage, 'Rule validation log message not found')

    // Check for router creation log
    const routerMessage = logRecords.find(msg =>
      msg.msg && msg.msg.includes('Creating router for cacheable interceptor')
    )
    assert.ok(routerMessage, 'Router creation log message not found')
  })

  test('should log during header processing', async () => {
    // Create server that returns empty response
    const server = createServer((req, res) => {
      res.end('Test response')
    })

    await new Promise(resolve => {
      server.listen(0, resolve)
    })

    const port = server.address().port

    // Create an array to store log records
    const logRecords = []

    // Create a simple in-memory destination for Pino
    const memoryDest = {
      write: (chunk) => {
        const logObj = JSON.parse(chunk)
        logRecords.push(logObj)
        return true
      }
    }

    // Create a Pino logger with our memory destination
    const logs = pino({ level: 'debug' }, memoryDest)

    // Create interceptor with logger
    const interceptor = createInterceptor({
      rules: [
        {
          routeToMatch: `localhost:${port}/test`,
          headers: {
            'cache-control': 'public, max-age=3600'
          }
        }
      ],
      logger: logs
    })

    // Create agent with interceptor
    const agent = new Agent()
    const composedAgent = agent.compose(interceptor)
    setGlobalDispatcher(composedAgent)

    // Make request
    await request(`http://localhost:${port}/test`)

    // Verify log messages

    // Check for request processing log
    const processingMessage = logRecords.find(msg =>
      msg.msg && msg.msg.includes('Interceptor processing request')
    )
    assert.ok(processingMessage, 'Request processing log message not found')

    // Check for header addition log
    const headerMessage = logRecords.find(msg =>
      msg.msg && msg.msg.includes('Processing response headers')
    )
    assert.ok(headerMessage, 'Header processing log message not found')

    await new Promise(resolve => {
      server.close(resolve)
    })
  })

  test('should log for dynamic FGH headers', async () => {
    // Create server that returns empty response
    const server = createServer((req, res) => {
      res.end('Test response')
    })

    await new Promise(resolve => {
      server.listen(0, resolve)
    })

    const port = server.address().port

    // Create an array to store log records
    const logRecords = []

    // Create a simple in-memory destination for Pino
    const memoryDest = {
      write: (chunk) => {
        const logObj = JSON.parse(chunk)
        logRecords.push(logObj)
        return true
      }
    }

    // Create a Pino logger with our memory destination
    const logs = pino({ level: 'debug' }, memoryDest)

    // Create interceptor with logger and FGH expression
    const interceptor = createInterceptor({
      rules: [
        {
          routeToMatch: `localhost:${port}/users/:id`,
          headers: {
            'cache-control': 'public, max-age=3600',
            'x-user-id': { fgh: '.params.id' }
          }
        }
      ],
      logger: logs
    })

    // Create agent with interceptor
    const agent = new Agent()
    const composedAgent = agent.compose(interceptor)
    setGlobalDispatcher(composedAgent)

    // Make request
    await request(`http://localhost:${port}/users/123`)

    // Verify log messages

    // Check for FGH compilation log
    const compilationMessage = logRecords.find(msg =>
      msg.msg && msg.msg.includes('Compiled FGH expression')
    )
    assert.ok(compilationMessage, 'FGH compilation log message not found')

    // Check for dynamic header addition log
    const dynamicHeaderMessage = logRecords.find(msg =>
      msg.headerName === 'x-user-id' && msg.msg && msg.msg.includes('Added dynamic header')
    )
    assert.ok(dynamicHeaderMessage, 'Dynamic header addition log message not found')

    await new Promise(resolve => {
      server.close(resolve)
    })
  })
})
