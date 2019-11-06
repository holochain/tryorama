
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

export const spawnTest: T.SpawnConductorFn = async (player: Player, { }) => {
  return new Conductor({
    name: 'test-conductor',
    kill: async () => { },
    onSignal: () => { },
    onActivity: () => { },
    adminWsUrl: '',
    zomeWsUrl: '',
  })
}

export const spawnLocal: T.SpawnConductorFn = async (player: Player, { handleHook }): Promise<Conductor> => {
  const name = player.name
  const configPath = getConfigPath(player._configSeedArgs.configDir)
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
    handle.stderr.on('data', data => plainLogger.error(getFancy(`{{{CONDUCTOR ${name}}}}\n${data.toString('utf8')}`)))

    if (handleHook) {
      player.logger.info('running spawned handle hack. TODO: document this.')
      handleHook(handle)
    }

    const conductor = new Conductor({
      name,
      kill: async (...args) => handle.kill(...args),
      onSignal: player.onSignal.bind(player),
      onActivity: player.onActivity,
      adminWsUrl: `ws://localhost:${player._configSeedArgs.adminPort}`,
      zomeWsUrl: `ws://localhost:${player._configSeedArgs.zomePort}`,
    })

    await awaitConductorInterfaceStartup(handle, player.name)

    return conductor
    // NB: the code to await for the interfaces to start up has been moved
    // to Player::_awaitConductorInterfaceStartup, so that we have access
    // to the handle immediately. Consequently this no longer needs to be
    // a Promise that's returned. So, kind of a TODO.
  } catch (err) {
    return Promise.reject(err)
  }
}

const awaitConductorInterfaceStartup = (handle, name) => {
  return new Promise((resolve, reject) => {
    handle.on('close', code => {
      logger.info(`conductor '${name}' exited with code ${code}`)
      // this rejection will have no effect if the promise already resolved,
      // which happens below
      reject(`Conductor exited before fully starting (code ${code})`)
    })
    handle.stdout.on('data', data => {
      // wait for the logs to convey that the interfaces have started
      // because the consumer of this function needs those interfaces
      // to be started so that it can initiate, and form,
      // the websocket connections
      if (data.toString('utf8').indexOf('Starting interfaces...') >= 0) {
        logger.info(`Conductor '${name}' process spawning successful`)
        resolve(handle)
      }
    })
  })
}

export const spawnRemote = (trycp: TrycpClient, machineUrl: string): T.SpawnConductorFn => async (player: Player): Promise<Conductor> => {
  const name = player.name

  const spawnResult = await trycp.spawn(name)
  logger.info(`TryCP spawn result: ${spawnResult}`)
  // NB: trycp currently blocks until conductor is ready. It would be nice if it instead sent a notification asynchronously when the conductor is ready.
  // logger.info('Waiting 30 seconds for remote conductor to be ready to receive websocket connections...')
  // await delay(30000)
  // logger.info('Done waiting. Ready or not, here we come, remote conductor!')

  return new Conductor({
    name,
    kill: (signal?) => trycp.kill(name, signal),
    onSignal: player.onSignal.bind(player),
    onActivity: player.onActivity,
    adminWsUrl: `${machineUrl}:${player._configSeedArgs.adminPort}`,
    zomeWsUrl: `${machineUrl}:${player._configSeedArgs.zomePort}`,
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
