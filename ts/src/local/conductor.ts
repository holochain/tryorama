import {
  AdminWebsocket,
  AppAgentWebsocket,
  AppBundleSource,
  AppWebsocket,
  AttachAppInterfaceRequest,
  CallZomeRequest,
  CallZomeRequestSigned,
  encodeHashToBase64,
  getSigningCredentials,
  InstallAppRequest,
  InstalledAppId,
} from "@holochain/client";
import getPort, { portNumbers } from "get-port";
import pick from "lodash/pick.js";
import assert from "node:assert";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { URL } from "node:url";
import { v4 as uuidv4 } from "uuid";

import { enableAndGetAgentApp } from "../common.js";
import { makeLogger } from "../logger.js";
import {
  AgentApp,
  AgentsAppsOptions,
  AppOptions,
  IConductor,
} from "../types.js";

const logger = makeLogger("Local Conductor");

const HOST_URL = new URL("ws://127.0.0.1");
const DEFAULT_TIMEOUT = 15000;
const LAIR_PASSWORD = "lair-password";

/**
 * The network type the conductor should use to communicate with peers.
 *
 * @public
 */
export enum NetworkType {
  WebRtc = "webrtc",
  Mem = "mem",
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
  "bootstrapUrl" | "networkType" | "timeout"
>;

/**
 * The function to create a conductor. It starts a sandbox conductor via the
 * Holochain CLI.
 *
 * @returns A conductor instance.
 *
 * @public
 */
export const createConductor = async (
  signalingServerUrl: string,
  options?: ConductorOptions
) => {
  const createConductorOptions: CreateConductorOptions = pick(options, [
    "bootstrapUrl",
    "networkType",
    "timeout",
  ]);
  const conductor = await Conductor.create(
    signalingServerUrl,
    createConductorOptions
  );
  if (options?.startup !== false) {
    await conductor.startUp();
    if (options?.attachAppInterface !== false) {
      await conductor.attachAppInterface();
      await conductor.connectAppInterface();
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
  private _appAgentWs: AppAgentWebsocket | undefined;
  private readonly timeout: number;

  private constructor(timeout?: number) {
    this.conductorProcess = undefined;
    this.conductorDir = undefined;
    this.adminApiUrl = new URL(HOST_URL.href);
    this.appApiUrl = new URL(HOST_URL.href);
    this._adminWs = undefined;
    this._appWs = undefined;
    this._appAgentWs = undefined;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Factory to create a conductor.
   *
   * @returns A configured instance of a conductor, not yet running.
   */
  static async create(
    signalingServerUrl: string,
    options?: CreateConductorOptions
  ) {
    const networkType = options?.networkType ?? NetworkType.WebRtc;
    if (options?.bootstrapUrl && networkType !== NetworkType.WebRtc) {
      throw new Error(
        "error creating conductor: bootstrap service can only be set for webrtc network"
      );
    }

    const args = ["sandbox", "--piped", "create", "network"];
    if (options?.bootstrapUrl) {
      args.push("--bootstrap", options.bootstrapUrl.href);
    }
    args.push(networkType);
    if (networkType === NetworkType.WebRtc) {
      args.push(signalingServerUrl);
    }
    const createConductorProcess = spawn("hc", args);
    createConductorProcess.stdin.write(LAIR_PASSWORD);
    createConductorProcess.stdin.end();

    const conductor = new Conductor(options?.timeout);
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
      ["sandbox", "--piped", "run", "-e", this.conductorDir],
      {
        detached: true, // create a process group; without this option, killing
        // the process doesn't kill the conductor
      }
    );
    runConductorProcess.stdin.write(LAIR_PASSWORD);
    runConductorProcess.stdin.end();

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
          logger.info(data.toString());
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
   */
  async connectAppInterface() {
    assert(
      this.appApiUrl.port,
      "error connecting app interface: app api port has not been defined"
    );

    logger.debug(`connecting App API to port ${this.appApiUrl.port}\n`);
    this._appWs = await AppWebsocket.connect(this.appApiUrl.href, this.timeout);
    this.setUpImplicitZomeCallSigning();
  }

  /**
   * Connect a web socket for a specific app to the App API.
   */
  async connectAppAgentInterface(appId: InstalledAppId) {
    assert(
      this.appApiUrl.port,
      "error connecting app interface: app api port has not been defined"
    );

    logger.debug(`connecting App API to port ${this.appApiUrl.port}\n`);
    this._appAgentWs = await AppAgentWebsocket.connect(
      this.appApiUrl.href,
      appId,
      this.timeout
    );
    this._appWs = this._appAgentWs.appWebsocket;
    this.setUpImplicitZomeCallSigning();
  }

  private setUpImplicitZomeCallSigning() {
    const callZome = this.appWs().callZome;
    this.appWs().callZome = async (
      req: CallZomeRequest | CallZomeRequestSigned
    ) => {
      if (!getSigningCredentials(req.cell_id)) {
        await this.adminWs().authorizeSigningCredentials(req.cell_id);
      }
      return callZome(req);
    };
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
   * Get all App API methods of a specific app.
   *
   * @returns The app agent web socket.
   */
  appAgentWs() {
    assert(this._appAgentWs, "app ws has not been connected");
    return this._appAgentWs;
  }

  /**
   * Install an application into the conductor.
   *
   * @param appBundleSource - The bundle or path to the bundle.
   * @param options - {@link AppOptions} for the hApp bundle (optional).
   * @returns An agent app with cells and conductor handle.
   */
  async installApp(appBundleSource: AppBundleSource, options?: AppOptions) {
    const agent_key =
      options?.agentPubKey ?? (await this.adminWs().generateAgentPubKey());
    const installed_app_id = options?.installedAppId ?? `app-${uuidv4()}`;
    const membrane_proofs = options?.membraneProofs ?? {};
    const network_seed = options?.networkSeed;
    const installAppRequest: InstallAppRequest =
      "bundle" in appBundleSource
        ? {
            bundle: appBundleSource.bundle,
            agent_key,
            membrane_proofs,
            installed_app_id,
            network_seed,
          }
        : {
            path: appBundleSource.path,
            agent_key,
            membrane_proofs,
            installed_app_id,
            network_seed,
          };
    logger.debug(
      `installing app with id ${installed_app_id} for agent ${encodeHashToBase64(
        agent_key
      )}`
    );
    const installedAppInfo = await this.adminWs().installApp(installAppRequest);
    const agentApp: AgentApp = await enableAndGetAgentApp(
      this,
      agent_key,
      installedAppInfo
    );
    return agentApp;
  }

  /**
   * Install an app for multiple agents into the conductor.
   */
  async installAgentsApps(options: AgentsAppsOptions) {
    const agentsApps: AgentApp[] = [];
    for (const appsForAgent of options.agentsApps) {
      const agentApp = await this.installApp(appsForAgent.app, {
        agentPubKey: appsForAgent.agentPubKey,
        membraneProofs: appsForAgent.membraneProofs,
        installedAppId: options.installedAppId,
        networkSeed: options.networkSeed,
      });
      agentsApps.push(agentApp);
    }
    return agentsApps;
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
