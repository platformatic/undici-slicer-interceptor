import { describe, test } from 'node:test'
import assert from 'node:assert'
import { createInterceptor } from '../index.js'

describe('make-cacheable-interceptor - duplicate rules detection', () => {
  test('should throw an error when multiple rules defined for the same path and origin', () => {
    // Define rules with the same path for the same origin
    const rules = [
      {
        routeToMatch: 'example.com/api/data',
        headers: { 'cache-control': 'public, max-age=86400' }
      },
      {
        routeToMatch: 'example.com/api/data',
        headers: { 'cache-control': 'private, max-age=3600' }
      }
    ]

    // Creating an interceptor should throw an error
    assert.throws(
      () => createInterceptor({ rules }),
      {
        message: /Multiple rules for the same path: '\/api\/data' for origin 'example.com'/
      }
    )
  })

  test('should throw an error with detailed information about conflicting rules', () => {
    // Define rules with the same path for the same origin but with different cache controls
    const rules = [
      {
        routeToMatch: 'example.com/api/users',
        headers: { 'cache-control': 'public, max-age=86400' },
        cacheTags: "'user'"
      },
      {
        routeToMatch: 'example.com/api/users',
        headers: { 'cache-control': 'private, max-age=3600' },
        cacheTags: "'private-user'"
      }
    ]

    // Creating an interceptor should throw an error
    assert.throws(
      () => createInterceptor({ rules }),
      {
        message: /Multiple rules for the same path: '\/api\/users' for origin 'example.com'. First rule: 'example.com\/api\/users', conflicting rule: 'example.com\/api\/users'/
      }
    )
  })

  test('should not throw an error when rules have same path but different origins', () => {
    // Define rules with the same path but different origins
    const rules = [
      {
        routeToMatch: 'example.com/api/data',
        headers: { 'cache-control': 'public, max-age=86400' }
      },
      {
        routeToMatch: 'other-domain.com/api/data',
        headers: { 'cache-control': 'private, max-age=3600' }
      }
    ]

    // Creating an interceptor should not throw an error
    assert.doesNotThrow(() => createInterceptor({ rules }))
  })

  test('should not throw an error when rules have different paths for the same origin', () => {
    // Define rules with different paths for the same origin
    const rules = [
      {
        routeToMatch: 'example.com/api/data',
        headers: { 'cache-control': 'public, max-age=86400' }
      },
      {
        routeToMatch: 'example.com/api/users',
        headers: { 'cache-control': 'private, max-age=3600' }
      }
    ]

    // Creating an interceptor should not throw an error
    assert.doesNotThrow(() => createInterceptor({ rules }))
  })
})
