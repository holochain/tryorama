
// from https://hackernoon.com/functional-javascript-resolving-promises-sequentially-7aac18c4431e
export const promiseSerial = promises =>
  promises.reduce((promise, p) =>
    promise.then(result =>
      p.then(Array.prototype.concat.bind(result))),
    Promise.resolve([]))
