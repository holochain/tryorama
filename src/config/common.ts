const fs = require('fs').promises
const os = require('os')
const path = require('path')

import env from '../env'

export const mkdirIdempotent = dir => fs.access(dir).catch(() => {
  fs.mkdir(dir, { recursive: true })
})

const tempDirBase = path.join(env.tempStorage || os.tmpdir(), 'tryorama/')
mkdirIdempotent(tempDirBase)

export const tempDir = async () => {
  await mkdirIdempotent(tempDirBase)
  return fs.mkdtemp(tempDirBase)
}

/**
 * Directory to store downloaded DNAs in.
 * **NOTE**: this is currently shared among all runs over all time, for better caching.
 * TODO: change this to `tempDir` instead of `tempDirBase` to remove this overzealous caching!
 */
export const dnaDir = async () => {
  const dir = path.join(tempDirBase, 'dnas-fetched')
  await mkdirIdempotent(dir)
  return dir
}

export const dnaPathToId = (dnaPath) => {
  const matches = dnaPath.match(/([^/]+)$/g)
  return matches[0].replace(/\.dna\.json$/, '')
}