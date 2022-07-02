import {
  AdminWebsocket,
  AppBundleSource,
  AppSignalCb,
  AppWebsocket,
  AttachAppInterfaceRequest,
  DnaSource,
  DnaProperties,
  InstallAppBundleRequest,
  InstallAppDnaPayload,
  RegisterDnaRequest,
} from "@holochain/client";
import getPort, { portNumbers } from "get-port";
import pick from "lodash/pick.js";
import assert from "node:assert";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { URL } from "node:url";
import { v4 as uuidv4 } from "uuid";

import { enableAndGetAgentHapp } from "../common.js";
import { makeLogger } from "../logger.js";
import {
  AgentHapp,
  HappBundleOptions,
  IConductor,
  _RegisterDnaReqOpts,
} from "../types.js";

const logger = makeLogger("Local Conductor");

const HOST_URL = new URL("ws://127.0.0.1");
const DEFAULT_TIMEOUT = 15000;

/**
 * The network type the conductor should use to communicate with peers.
 *
 * @public
 */
export enum NetworkType {
  Quic = "quic",
  Mdns = "mdns",
}

/**
 * @public
 */
export interface ConductorOptions {
  /**
   * Start up conductor after creation.
   *
   * @defaultValue true
   */
  startup?: boolean;

  /**
   * Attach an app interface to the conductor and connect an app websocket
   * to it.
   *
   * @defaultValue true
   */
  attachAppInterface?: boolean;

  /**
   * Register a signal handler on the app websocket.
   */
  signalHandler?: AppSignalCb;

  /**
   * The network type the conductor should use
   *
   * @defaultValue quic
   */
  networkType?: NetworkType;

  /**
   * A bootstrap service URL for peers to discover each other
   */
  bootstrapUrl?: URL;

  /**
   * Network interface and port to bind to
   *
   * @defaultValue "kitsune-quic://0.0.0.0:0"
   */
  bindTo?: URL;

  /**
   * Run through an external proxy
   */
  proxy?: URL;

  /**
   * If you have port-forwarding set up or wish to apply a vanity domain name,
   * you may need to override the local IP.
   *
   * @defaultValue undefined = no override
   */
  hostOverride?: URL;

  /**
   * If you have port-forwarding set up, you may need to override the local
   * port.
   *
   * @defaultValue undefined = no override
   */
  portOverride?: number;

  /**
   * Timeout for requests to Admin and App API
   */
  timeout?: number;
}

/**
 * Options for using the conductor factory.
 *
 * @public
 */
export type CreateConductorOptions = Pick<
  ConductorOptions,
  | "bindTo"
  | "bootstrapUrl"
  | "hostOverride"
  | "networkType"
  | "portOverride"
  | "proxy"
  | "timeout"
>;

/**
 * The function to create a conductor. It starts a sandbox conductor via the
 * Holochain CLI.
 *
 * @returns A conductor instance.
 *
 * @public
 */
export const createConductor = async (options?: ConductorOptions) => {
  const createConductorOptions: CreateConductorOptions = pick(options, [
    "bindTo",
    "bootstrapUrl",
    "hostOverride",
    "networkType",
    "portOverride",
    "proxy",
    "timeout",
  ]);
  const conductor = await Conductor.create(createConductorOptions);
  if (options?.startup !== false) {
    await conductor.startUp();
    if (options?.attachAppInterface !== false) {
      await conductor.attachAppInterface();
      await conductor.connectAppInterface(options?.signalHandler);
    }
  }
  return conductor;
};

/**
 * A class to manage a conductor running on localhost.
 *
 * @public
 */
export class Conductor implements IConductor {
  private conductorProcess: ChildProcessWithoutNullStreams | undefined;
  private conductorDir: string | undefined;
  private adminApiUrl: URL;
  private appApiUrl: URL;
  private _adminWs: AdminWebsocket | undefined;
  private _appWs: AppWebsocket | undefined;
  private readonly timeout: number;

  private constructor(timeout?: number) {
    this.conductorProcess = undefined;
    this.conductorDir = undefined;
    this.adminApiUrl = new URL(HOST_URL.href);
    this.appApiUrl = new URL(HOST_URL.href);
    this._adminWs = undefined;
    this._appWs = undefined;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Factory to create a conductor.
   *
   * @returns A configured instance of a conductor, not yet running.
   */
  static async create(options?: CreateConductorOptions) {
    const networkType = options?.networkType ?? NetworkType.Quic;
    if (options?.bootstrapUrl && networkType !== NetworkType.Quic) {
      throw new Error(
        "error creating a conductor: bootstrap service can only be set for quic network"
      );
    }

    const conductor = new Conductor(options?.timeout);
    const args = ["sandbox", "create", "network"];
    if (options?.bootstrapUrl) {
      args.push("--bootstrap", options.bootstrapUrl.href);
    }
    args.push(networkType);
    if (options?.bindTo) {
      args.push("--bind-to", options.bindTo.href);
    }
    if (options?.hostOverride) {
      args.push("--override-host", options.hostOverride.href);
    }
    if (options?.portOverride) {
      args.push("--override-port", options.portOverride.toString());
    }
    if (options?.proxy) {
      args.push("-p", options.proxy.href);
    }
    const createConductorProcess = spawn("hc", args);

    const createConductorPromise = new Promise<Conductor>((resolve, reject) => {
      createConductorProcess.stdout.on("data", (data: Buffer) => {
        logger.debug(`creating conductor config\n${data.toString()}`);
        const tmpDirMatches = data.toString().match(/Created (\[".+"])/);
        if (tmpDirMatches) {
          conductor.conductorDir = JSON.parse(tmpDirMatches[1])[0];
        }
      });
      createConductorProcess.stdout.on("end", () => {
        resolve(conductor);
      });
      createConductorProcess.stderr.on("data", (err) => {
        logger.error(`error when creating conductor config: ${err}\n`);
        reject(err);
      });
    });
    return createConductorPromise;
  }

  /**
   * Start the conductor and establish a web socket connection to the Admin
   * API.
   */
  async startUp() {
    assert(
      this.conductorDir,
      "error starting conductor: conductor has not been created"
    );
    if (this.conductorProcess) {
      logger.error("error starting conductor: conductor is already running\n");
      return;
    }

    const runConductorProcess = spawn(
      "hc",
      ["sandbox", "run", "-e", this.conductorDir],
      {
        detached: true, // create a process group; without this option, killing
        // the process doesn't kill the conductor
      }
    );
    const startPromise = new Promise<void>((resolve) => {
      runConductorProcess.stdout.on("data", (data: Buffer) => {
        const adminPortMatches = data
          .toString()
          .match(/Running conductor on admin port (\d+)/);
        const isConductorStarted = data
          .toString()
          .includes("Connected successfully to a running holochain");
        if (adminPortMatches || isConductorStarted) {
          if (adminPortMatches) {
            this.adminApiUrl.port = adminPortMatches[1];
            logger.debug(`starting conductor\n${data}`);
          }
          if (isConductorStarted) {
            // this is the last output of the startup process
            this.conductorProcess = runConductorProcess;
            resolve();
          }
        } else {
          logger.debug(data.toString());
        }
      });

      runConductorProcess.stderr.on("data", (data: Buffer) => {
        logger.info(data.toString());
      });
    });
    await startPromise;
    await this.connectAdminWs();
  }

  /**
   * Close Admin and App API connections and kill the conductor process.
   */
  async shutDown() {
    if (!this.conductorProcess) {
      logger.info("shut down conductor: conductor is not running");
      return null;
    }

    logger.debug("closing admin and app web sockets\n");
    assert(this._adminWs, "admin websocket is not connected");
    await this._adminWs.client.close();
    this._adminWs = undefined;
    if (this._appWs) {
      await this._appWs.client.close();
      this._appWs = undefined;
    }

    logger.debug("shutting down conductor\n");
    const conductorShutDown = new Promise<number | null>((resolve) => {
      // I don't know why this is possibly undefined despite the initial guard
      assert(this.conductorProcess);
      this.conductorProcess.on("exit", (code) => {
        this.conductorProcess?.removeAllListeners();
        this.conductorProcess?.stdout.removeAllListeners();
        this.conductorProcess?.stderr.removeAllListeners();
        this.conductorProcess = undefined;
        resolve(code);
      });
      assert(this.conductorProcess.pid);
      process.kill(-this.conductorProcess.pid);
    });
    return conductorShutDown;
  }

  private async connectAdminWs() {
    this._adminWs = await AdminWebsocket.connect(
      this.adminApiUrl.href,
      this.timeout
    );
    logger.debug(`connected to Admin API @ ${this.adminApiUrl.href}\n`);
  }

  /**
   * Attach a web socket to the App API.
   *
   * @param request - Specify a port for the web socket (optional).
   */
  async attachAppInterface(request?: AttachAppInterfaceRequest) {
    request = request ?? {
      port: await getPort({ port: portNumbers(30000, 40000) }),
    };
    logger.debug(`attaching App API to port ${request.port}\n`);
    const { port } = await this.adminWs().attachAppInterface(request);
    this.appApiUrl.port = port.toString();
  }

  /**
   * Connect a web socket to the App API.
   *
   * @param signalHandler - A callback function to handle signals.
   */
  async connectAppInterface(signalHandler?: AppSignalCb) {
    assert(
      this.appApiUrl.port,
      "error connecting app interface: app api port has not been defined"
    );

    logger.debug(`connecting App API to port ${this.appApiUrl.port}\n`);
    this._appWs = await AppWebsocket.connect(
      this.appApiUrl.href,
      this.timeout,
      signalHandler
    );
  }

  /**
   * Get the path of the directory that contains all files and folders of the
   * conductor.
   *
   * @returns The conductor's temporary directory.
   */
  getTmpDirectory() {
    assert(this.conductorDir);
    return this.conductorDir;
  }

  /**
   * Get all Admin API methods.
   *
   * @returns The Admin API web socket.
   */
  adminWs() {
    assert(this._adminWs, "admin ws has not been connected");
    return this._adminWs;
  }

  /**
   * Get all App API methods.
   *
   * @returns The App API web socket.
   */
  appWs() {
    assert(this._appWs, "app ws has not been connected");
    return this._appWs;
  }

  /**
   * Install a set of DNAs for multiple agents into the conductor.
   *
   * @param options - An array of DNAs for each agent, resulting in a
   * 2-dimensional array, and a UID for the DNAs (optional).
   * @returns An array with each agent's hApps.
   */
  async installAgentsHapps(options: {
    agentsDnas: DnaSource[][];
    uid?: string;
    properties?: DnaProperties;
  }) {
    const agentsHapps: AgentHapp[] = [];

    for (const agent of options.agentsDnas) {
      const dnas: InstallAppDnaPayload[] = [];
      const agentPubKey = await this.adminWs().generateAgentPubKey();
      const appId = `app-${uuidv4()}`;

      for (const dna of agent) {
        let role_id: string;

        const registerDnaReqOpts: _RegisterDnaReqOpts = {
          uid: options.uid,
          properties: options.properties,
        };

        if ("path" in dna) {
          registerDnaReqOpts["path"] = dna.path;
          role_id = `${dna.path}-${uuidv4()}`;
        } else if ("hash" in dna) {
          registerDnaReqOpts["hash"] = dna.hash;
          role_id = `dna-${uuidv4()}`;
        } else {
          registerDnaReqOpts["bundle"] = dna.bundle;
          role_id = `${dna.bundle.manifest.name}-${uuidv4()}`;
        }

        const dnaHash = await this.adminWs().registerDna(
          registerDnaReqOpts as RegisterDnaRequest
        );

        dnas.push({ hash: dnaHash, role_id });
      }

      const installedAppInfo = await this.adminWs().installApp({
        installed_app_id: appId,
        agent_key: agentPubKey,
        dnas,
      });
      const agentHapp = await enableAndGetAgentHapp(
        this,
        agentPubKey,
        installedAppInfo
      );
      agentsHapps.push(agentHapp);
    }

    return agentsHapps;
  }

  /**
   * Install a hApp bundle into the conductor.
   *
   * @param appBundleSource - The bundle or path to the bundle.
   * @param options - {@link HappBundleOptions} for the hApp bundle (optional).
   * @returns A hApp for the agent.
   */
  async installHappBundle(
    appBundleSource: AppBundleSource,
    options?: HappBundleOptions
  ) {
    const agentPubKey =
      options?.agentPubKey ?? (await this.adminWs().generateAgentPubKey());
    const appBundleOptions: InstallAppBundleRequest = Object.assign(
      appBundleSource,
      {
        agent_key: agentPubKey,
        membrane_proofs: options?.membraneProofs ?? {},
        uid: options?.uid,
        installed_app_id: options?.installedAppId ?? `app-${uuidv4()}`,
      }
    );
    const installedAppInfo = await this.adminWs().installAppBundle(
      appBundleOptions
    );

    const agentHapp = await enableAndGetAgentHapp(
      this,
      agentPubKey,
      installedAppInfo
    );
    return agentHapp;
  }
}

/**
 * Run the `hc` command to delete all conductor data.
 *
 * @returns A promise that resolves when the command is complete.
 *
 * @public
 */
export const cleanAllConductors = async () => {
  const conductorProcess = spawn("hc", ["sandbox", "clean"]);
  const cleanPromise = new Promise<void>((resolve) => {
    conductorProcess.stdout.once("end", () => {
      logger.debug("sandbox conductors cleaned\n");
      resolve();
    });
  });
  return cleanPromise;
};
