import { describe, test } from 'node:test'
import assert from 'node:assert'
import { validateRules } from '../lib/validator.js'
import { parseRouteWithOrigin, extractOrigin } from '../lib/router.js'

describe('make-cacheable-interceptor - simplified origin tests', () => {
  test('should correctly parse route with origin', () => {
    // Test with hostname/path
    const result1 = parseRouteWithOrigin('example.com/api/data')
    assert.deepStrictEqual(result1, {
      origin: 'example.com',
      path: '/api/data'
    })
    
    // Test with hostname:port/path
    const result2 = parseRouteWithOrigin('example.com:3000/api/data')
    assert.deepStrictEqual(result2, {
      origin: 'example.com:3000',
      path: '/api/data'
    })
    
    // Test with protocol (should be ignored)
    const result3 = parseRouteWithOrigin('http://example.com:3000/api/data')
    assert.deepStrictEqual(result3, {
      origin: 'example.com:3000',
      path: '/api/data'
    })
  })
  
  test('should throw error for invalid route format', () => {
    assert.throws(() => {
      parseRouteWithOrigin('invalid-route-no-slash')
    }, /Invalid route format/)
  })
  
  test('should validate rules with origin in route', () => {
    // Valid rules with origin
    validateRules([
      { 
        routeToMatch: 'example.com/api/*', 
        cacheControl: 'public, max-age=3600' 
      },
      { 
        routeToMatch: 'example.com:3000/static/*', 
        cacheControl: 'public, max-age=86400' 
      }
    ])
    
    // Invalid rule without origin
    assert.throws(() => {
      validateRules([
        { 
          routeToMatch: '/api/*', 
          cacheControl: 'public, max-age=3600' 
        }
      ])
    }, /Origin must be specified/)
  })
})
