
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export const identity = x => x

// from https://hackernoon.com/functional-javascript-resolving-promises-sequentially-7aac18c4431e
export const promiseSerial = promises =>
  promises.reduce((promise, p) =>
    promise.then(result =>
      p.then(Array.prototype.concat.bind(result))),
      Promise.resolve([]))