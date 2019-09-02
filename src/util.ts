const fs = require('fs')
import axios from 'axios'
import logger from './logger'
import { ObjectS } from './types';

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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

export const downloadFile = async ({ url, path, overwrite }: { url: string, path: string, overwrite?: boolean }): Promise<string> => {
  if (overwrite) {
    // only download file if it doesn't already exist at this path.
    return fs.access(path).catch(() => _downloadFile({ url, path }))
  } else {
    return _downloadFile({ url, path })
  }
}

const _downloadFile = async ({ url, path }: { url: string, path: string }): Promise<string> => {
  const response = await axios.request({
    url: url,
    method: 'GET',
    responseType: 'stream',
    maxContentLength: 999999999999,
  }).catch(e => {
    logger.warn('axios error: ', parseAxiosError(e))
    return e.response
  })

  return new Promise((fulfill, reject) => {
    if (response.status != 200) {
      reject(`Could not fetch ${url}, response was ${response.statusText} ${response.status}`)
    } else {
      const writer = fs.createWriteStream(path)
        .on("error", reject)
        .on("finish", () => {
          logger.debug("Download complete.")
          fulfill(path)
        })
      logger.debug("Starting streaming download...")
      response.data.pipe(writer)
    }
  })
}

const parseAxiosError = e => {
  if ('config' in e && 'request' in e && 'response' in e) {
    return {
      request: {
        method: e.config.method,
        url: e.config.url,
        data: e.config.data,
      },
      response: !e.response ? e.response : {
        status: e.response.status,
        statusText: e.response.statusText,
        data: e.response.data,
      }
    }
  } else {
    return e
  }
}