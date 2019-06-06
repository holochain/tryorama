
import {ScenarioFnCustom} from './types'

export const compose = (...ms) => (f: ScenarioFnCustom): ScenarioFnCustom => ms.reduce((g, m) => m(g), f)

/**
 * Middleware to retrofit each instance with a `callSync` method
 */
export const callSyncMiddleware = f => (s, ins) => {
  // callSync "polyfill"
  Object.values(ins).forEach((i: any) => {
    i.callSync = async (...args) => {
        const ret = await i.call(...args)
        await s.consistent()
        return ret
    }
  })
  return f(s, ins)
}

/**
 * Middleware to retrofit each instance with an `agentId` member,
 * equivalent to the `agentAddress`
 */
export const agentIdMiddleware = f => (s, ins) => {
    // agentId "polyfill"
  Object.values(ins).forEach((i: any) => {
    i.agentId = i.agentAddress
  })
  return f(s, ins)
}

export const backwardCompatibilityMiddleware = compose(callSyncMiddleware, agentIdMiddleware)
