
import { spawn, execSync, ChildProcess } from "child_process";
import logger, { makeLogger } from "../logger";
import * as T from '../types'
import axios from "axios"
import * as path from "path";
import { Player } from "..";
import { Conductor } from "../conductor";
import { getConfigPath } from ".";

export const spawnLocal: T.SpawnConductorFn = async (player: Player): Promise<Conductor> => {
  const name = player.name
  const configPath = getConfigPath(player._genConfigArgs.configDir)
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

    const conductor = new Conductor({
      name,
      kill: async (...args) => handle.kill(...args),
      onSignal: player.onSignal.bind(player),
      onActivity: player.onActivity,
      adminWsUrl: `${player._genConfigArgs.urlBase}:${player._genConfigArgs.adminPort}`,
      zomeWsUrl: `${player._genConfigArgs.urlBase}:${player._genConfigArgs.zomePort}`,
    })
    return conductor
    // NB: the code to await for the interfaces to start up has been moved
    // to Player::_awaitConductorInterfaceStartup, so that we have access
    // to the handle immediately. Consequently this no longer needs to be
    // a Promise that's returned. So, kind of a TODO.
  } catch (err) {
    return Promise.reject(err)
  }
}

export const spawnRemote: T.SpawnConductorFn = async (player: Player): Promise<Conductor> => {
  const name = player.name

  return new Conductor({
    name,
    kill: (signal?) => trycp.call('kill', signal),
    onSignal: player.onSignal.bind(player),
    onActivity: player.onActivity,
    adminWsUrl: 'TODO',
    zomeWsUrl: 'TODO',
  })
}

class TrycpHandle implements T.Mortal {

  kill: () => Promise<void>

  constructor(urlBase: string, id: string) {
    this.kill = async () => {
      const url = path.join()
      await axios.post(url, { id })
    }
  }

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
 * TODO: disable `.kill()` and `.spawn()` in scenario API
 */
export const memoizedSpawner = () => {
  const memomap = {}
  return (player): Promise<ChildProcess> => {
    const name = player.name
    if (!(name in memomap)) {
      memomap[name] = spawnLocal(player)
    }
    return memomap[name]
  }
}
