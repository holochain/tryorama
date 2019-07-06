const child_process = require('child_process')
const del = require('del')
const fs = require('fs')
const os = require('os')
const path = require('path')
const getPort = require('get-port')

const colors = require('colors/safe')

const _ = require('lodash')

import {Signal} from '@holochain/hachiko'
import {promiseSerial, delay} from './util'
import * as T from './types'
import {ScenarioInstanceRef, InstanceMap} from './instance'
import {Conductor} from './conductor'
import logger from './logger'

/// //////////////////////////////////////////////////////////

// these should be already set when the conductor is started by `hc test`
const wsUrl = port => `ws://localhost:${port}`

const DEFAULT_ZOME_CALL_TIMEOUT = 60000

type ConductorOpts = {
  onSignal: (Signal) => void,
  zomeCallTimeout?: number,
  name: string,
  adminInterfaceUrl: string,
  configPath
}

const storagePath = () => process.env.TRYORAMA_STORAGE || fs.mkdtempSync(path.join(os.tmpdir(), 'try-o-rama-'))

/**
 * Represents a conductor process to which calls can be made via RPC
 *
 * @class      Conductor (name)
 */
export class ConductorManaged extends Conductor {

  kill () {
    return this.handle.kill()
  }

  async abort (msg) {
    logger.error(`Test conductor aborted: %j`, msg)
    await this.kill()
    process.exit(-1)
  }

}
