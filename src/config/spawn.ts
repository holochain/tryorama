
import { spawn, execSync, ChildProcess } from "child_process";
import { Ws } from 'ws'
import axios from "axios"

import logger, { makeLogger } from "../logger";
import * as T from '../types'
import * as path from "path";
import { Player } from "..";
import { Conductor } from "../conductor";
import { getConfigPath } from ".";
import { trycpSession, TrycpClient } from "../trycp";
import { delay } from "../util";
import env from '../env'

export const spawnTest: T.SpawnConductorFn = async (player: Player, { }) => {
  return new Conductor({
    name: 'test-conductor',
    kill: async () => { },
    onSignal: () => { },
    onActivity: () => { },
    interfaceWsUrl: '',
  })
}

export const spawnLocal: T.SpawnConductorFn = async (player: Player, { handleHook } = {}): Promise<Conductor> => {
  const name = player.name
  const configPath = getConfigPath(player._configDir)
  let handle
  try {
    const binPath = process.env.TRYORAMA_HOLOCHAIN_PATH || 'holochain'
    const version = execSync(`${binPath} --version`)
    logger.info("Using conductor path: %s", binPath)
    logger.info("Holochain version: %s", version)
    handle = spawn(binPath, ['-c', configPath], {
      env: {
        "N3H_QUIET": "1",
        "RUST_BACKTRACE": "1",
        ...process.env,
      }
    })

    let plainLogger = makeLogger()

    handle.stdout.on('data', data => plainLogger.info(getFancy(`[[[CONDUCTOR ${name}]]]\n${data.toString('utf8')}`)))
    handle.stderr.on('data', data => plainLogger.info(getFancy(`{{{CONDUCTOR ${name}}}}\n${data.toString('utf8')}`)))

    if (handleHook) {
      // TODO: document this
      player.logger.info('running spawned handle hack.')
      handleHook(handle)
    }

    const newPort = await getTrueInterfacePort(handle, player.name)

    if (newPort) {
      player._interfacePort = newPort
    }

    const conductor = new Conductor({
      name,
      kill: async (...args) => handle.kill(...args),
      onSignal: player.onSignal.bind(player),
      onActivity: player.onActivity,
      interfaceWsUrl: `ws://localhost:${player._interfacePort}`,
    })

    return conductor

  } catch (err) {
    return Promise.reject(err)
  }
}

const getTrueInterfacePort = (handle, name): Promise<number | null> => {

  // This is a magic string output by the conductor when using the "choose_free_port"
  // Interface conductor config, to alert the client as to which port the interface chose.
  // This check only happens in tryorama once, whenever the conductor is spawned.
  //
  // # NB: HOWEVER, if tryorama ever calls an admin function which causes the interface to
  // restart, this port will change, and tryorama will not know about it!!
  // If we ever do something like that, we'll have to constantly monitor stdout
  // and update the interface port accordingly
  let portPattern = new RegExp(`\\*\\*\\* Bound interface '${env.interfaceId}' to port: (\\d+)`)

  return new Promise((fulfill, reject) => {
    let resolved = false
    handle.on('close', code => {
      resolved = true
      logger.info(`conductor '${name}' exited with code ${code}`)
      // this rejection will have no effect if the promise already resolved,
      // which happens below
      reject(`Conductor exited before starting interface (code ${code})`)
    })
    handle.stdout.on('data', data => {
      if (resolved) {
        return
      }
      // wait for the logs to convey that the interfaces have started
      // because the consumer of this function needs those interfaces
      // to be started so that it can initiate, and form,
      // the websocket connections
      const line = data.toString('utf8')
      const match = line.match(portPattern)

      if (match && match.length >= 2) {
        // If we find the magic string that identifies the correct port, let's use that
        const port = match[1]
        logger.info(`Conductor '${name}' process spawning successful. Interface port detected: ${port}`)
        logger.debug(`(stdout line parsed: ${line})`)
        resolved = true
        fulfill(port)
      } else if (line.indexOf("Done. All interfaces started.") >= 0) {
        // If we don't see the magic string, we'll see this line first instead
        logger.info(`Conductor '${name}' process spawning successful. No interface port detected.`)
        logger.debug(`(stdout line parsed: ${line})`)
        resolved = true
        fulfill(null)
      }
    })
  })
}

export const spawnRemote = (trycp: TrycpClient, machineUrl: string): T.SpawnConductorFn => async (player: Player): Promise<Conductor> => {
  const name = player.name
  const spawnResult = await trycp.spawn(name)
  logger.debug(`TryCP spawn result: ${spawnResult}`)
  // NB: trycp currently blocks until conductor is ready. It would be nice if it instead sent a notification asynchronously when the conductor is ready.
  // logger.info('Waiting 20 seconds for remote conductor to be ready to receive websocket connections...')
  // await delay(20000)
  // logger.info('Done waiting. Ready or not, here we come, remote conductor!')

  return new Conductor({
    name,
    kill: (signal?) => trycp.kill(name, signal),
    onSignal: player.onSignal.bind(player),
    onActivity: player.onActivity,
    interfaceWsUrl: `${machineUrl}:${player._interfacePort}`,
  })
}

const bullets = "☉★☯☸☮"
let currentBullet = 0

const getFancy = (output) => {
  const bullet = bullets[currentBullet]
  currentBullet = (currentBullet + 1) % bullets.length
  const indented = output.split('\n').join(`\n${bullet} `)
  return `\n${bullet}${bullet}${bullet} ${indented}`
}

/**
 * Only spawn one conductor per "name", to be used for entire test suite
 * Unused.
 * TODO: disable `.kill()` and `.spawn()` in scenario API
 */
const memoizedSpawner = () => {
  const memomap = {}
  return (player, args): Promise<ChildProcess> => {
    const name = player.name
    if (!(name in memomap)) {
      memomap[name] = spawnLocal(player, args)
    }
    return memomap[name]
  }
}
