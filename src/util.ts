import { ObjectS } from './types';

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export const trace = (x, msg = '{T}') => (console.log(msg, `<${typeof x}>`, x), x)
export const stringify = x => JSON.stringify(x, null, 2)

export const stripPortFromUrl = url => {
  const i = url.lastIndexOf(':')
  const maybePort = url.substring(i + 1)
  if (maybePort.match(/^\d{1,5}$/)) {
    return url.substring(0, i)
  } else {
    throw new Error(`No port found in string "${url}"`)
  }
}

// from https://hackernoon.com/functional-javascript-resolving-promises-sequentially-7aac18c4431e
export function promiseSerialArray<T>(promises: Array<Promise<T>>): Promise<Array<T>> {
  return promises.reduce((promise, p) =>
    promise.then(result =>
      p.then(Array.prototype.concat.bind(result))),
    Promise.resolve([]))
}

export function promiseSerialObject<T>(promises: ObjectS<Promise<T>>): Promise<ObjectS<T>> {
  return Object.entries(promises).reduce((promise, [key, p]) =>
    promise.then(result =>
      p.then(v => Object.assign(result, { [key]: v }))),
    Promise.resolve({}))
}

export const unimplemented = (reason: string) => {
  throw new Error("UNIMPLEMENTED: " + reason)
}
