import { spawn, execSync, ChildProcess } from "child_process";

import logger, { makeLogger } from "../logger";
import * as T from '../types'
import * as path from "path";
import { Player } from "..";
import { Conductor } from "../conductor";
import { getConfigPath } from ".";
import { TrycpClient } from "../trycp";
import { delay } from "../util";
import env from '../env'
var fs = require('fs');


export const spawnTest: T.SpawnConductorFn = async (player: Player, { }) => {
  return new Conductor({
    player,
    name: 'test-conductor',
    kill: async () => { },
    onSignal: null,
    onActivity: () => { },
    backend: { type: "test" },
  })
}

export const spawnLocal = (configDir: string, adminPort: number): T.SpawnConductorFn => async (player: Player, { handleHook } = {}): Promise<Conductor> => {
  const name = player.name
  const configPath = getConfigPath(configDir)
  let handle
  let lairHandle
  try {

    const lairDir = `${configDir}/keystore`
    if (!fs.existsSync(lairDir)) {
      fs.mkdirSync(lairDir);
    }
    logger.info("Spawning lair for test with keystore at:  %s", lairDir)
    const lairBinPath = env.lairPath
    lairHandle = await spawn(lairBinPath, ["-d", lairDir], {
      env: {
        // TODO: maybe put this behind a flag?
        "RUST_BACKTRACE": "1",
        ...process.env,
      }
    })
    // Wait for lair to output data such as "#lair-keystore-ready#" before starting holochain
    await new Promise((resolve) => { lairHandle.stdout.once("data", resolve) })

    const binPath = env.holochainPath
    const version = execSync(`${binPath} --version`)
    logger.info("Using conductor path:  %s", binPath)
    logger.info("Holochain version:     %s", version)
    logger.info("Conductor config path: %s", configPath)

    const flag = '-c'
    logger.debug('running: %s %s %s', binPath, flag, configPath)
    handle = spawn(binPath, [flag, configPath], {
      env: {
        // TODO: maybe put this behind a flag?
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

    await awaitInterfaceReady(handle, player.name)

    const conductor = new Conductor({
      player,
      name,
      kill: async (...args) => {
        // wait for it to be finished off before resolving
        const conductorKillPromise = new Promise((resolve) => {
          handle.once('close', resolve)
        })
        const lairKillPromise = new Promise((resolve) => {
          lairHandle.once('close', resolve)
        })
        const killPromise = Promise.all([conductorKillPromise, lairKillPromise])
        lairHandle.kill()
        handle.kill(...args)
        await killPromise
      },
      onSignal: player.onSignal,//player.onSignal.bind(player),
      onActivity: player.onActivity,
      backend: {
        type: "local",
        machineHost: "localhost",
        adminInterfacePort: adminPort
      },
    })

    return conductor

  } catch (err) {
    return Promise.reject(err)
  }
}

const awaitInterfaceReady = (handle, name): Promise<null> => new Promise((fulfill, reject) => {
  const pattern = 'Conductor ready.'
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

    const line = data.toString('utf8')
    if (line.match(pattern)) {
      logger.info(`Conductor '${name}' process spawning completed.`)
      resolved = true
      fulfill(null)
    }
  })
})

export const spawnRemote = (trycp: TrycpClient): T.SpawnConductorFn => async (player: Player): Promise<Conductor> => {
  const name = player.name
  const spawnResult = await trycp.spawn(name)
  logger.debug(`TryCP spawn result: ${spawnResult}`)
  // NB: trycp currently blocks until conductor is ready. It would be nice if it instead sent a notification asynchronously when the conductor is ready.
  // logger.info('Waiting 20 seconds for remote conductor to be ready to receive websocket connections...')
  // await delay(20000)
  // logger.info('Done waiting. Ready or not, here we come, remote conductor!')
  logger.info("Removeme: Creating conductor with onSignal: %o", player.onSignal?.bind(player))

  return new Conductor({
    player,
    name,
    kill: (signal?) => trycp.kill(name, signal),
    onSignal: player.onSignal?.bind(player),
    onActivity: player.onActivity,
    backend: {
      type: "trycp",
      adminInterfaceCall: (message) => trycp.adminInterfaceCall(name, message),
      appInterfaceCall: trycp.appInterfaceCall,
      downloadDnaRemote: trycp.downloadDna,
      saveDnaRemote: trycp.saveDna,
      pollAppInterfaceSignals: trycp.pollAppInterfaceSignals
    }
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
