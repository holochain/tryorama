/**
 * Allows "parking" (and unparking) of ports.
 * getPorts will find a port which is not used by another process
 * AND has not beed parked.
 * This prevents port collisions when instantiating multiple conductor simultaneously,
 * as well as the chance of another process taking the port specified in a conductor config
 * in between killing and spawning the same conductor
 */

import { Mutex } from 'async-mutex'
import env from '../env'

const getPortRaw = require('get-port')

const portMutex = new Mutex()
const PARKED_PORTS = new Set()

const [rangeLo, rangeHi] = env.portRange
let nextPort = rangeLo

// We can do away with this and just use port = 0 in rsm config,
// (but we need to find out what port we actually got)
// NB: the end user should never have to specify a port (they don't now either)
export const getPort = (): Promise<number> => portMutex.runExclusive(async (): Promise<number> => {
  let port: number = 0
  do {
    port = await getPortRaw({ port: getPortRaw.makeRange(nextPort, rangeHi) })
    nextPort += 1
    if (nextPort >= rangeHi) {
      nextPort = rangeLo
    }
  } while (PARKED_PORTS.has(port))
  PARKED_PORTS.add(port)
  return port
})

// export const parkPort = port => PARKED_PORTS.add(port)
export const unparkPort = (port: number) => PARKED_PORTS.delete(port)
