import { describe, test } from 'node:test'
import assert from 'node:assert'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - FGH header errors', () => {
  test('should throw error for invalid FGH expression in headers', () => {
    assert.throws(() => {
      createInterceptor([
        {
          routeToMatch: 'example.com/invalid-fgh-header',
          headers: { 
            'cache-control': 'public, max-age=3600',
            'x-invalid-fgh': { fgh: 'invalid[expression' } // This should cause an error during compilation
          }
        }
      ])
    }, /Error compiling FGH expression for header x-invalid-fgh: invalid\[expression/)
  })

  test('should throw error for missing fgh property in object value', () => {
    assert.throws(() => {
      createInterceptor([
        {
          routeToMatch: 'example.com/missing-fgh-prop',
          headers: { 
            'cache-control': 'public, max-age=3600',
            'x-wrong-object': { wrong: 'This is not a valid FGH object' } // Missing fgh property
          }
        }
      ])
    }, /Invalid header value for x-wrong-object: must have an fgh property if it's an object/)
  })
})
