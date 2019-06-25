
const _ = require('lodash')

import {ScenarioFnCustom} from './types'

export const compose = (...ms) => (f: ScenarioFnCustom): ScenarioFnCustom => ms.reduce((g, m) => m(g), f)

/**
 * Middleware to retrofit each instance with a `callSync` method
 */
export const callSyncMiddleware = f => (s, conductors) => {
  // callSync "polyfill"
  _.chain(conductors)
    .values()
    .forEach(c => c.values().forEach(i => {
      i.callSync = async (...args) => {
        const ret = await i.call(...args)
        await s.consistent()
        return ret
      }
    }))
  return f(s, conductors)
}

/**
 * Middleware to retrofit each instance with an `agentId` member,
 * equivalent to the `agentAddress`
 */
export const agentIdMiddleware = f => (s, conductors) => {
    // agentId "polyfill"
  _.chain(conductors)
    .values()
    .forEach(c => c.values().forEach(i => {
      i.agentId = i.agentAddress
    }))
  return f(s, conductors)
}

export const backwardCompatibilityMiddleware = compose(callSyncMiddleware, agentIdMiddleware)
