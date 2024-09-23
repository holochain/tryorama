import {
  AdminWebsocket,
  AppBundleSource,
  AppWebsocket,
  AttachAppInterfaceRequest,
  encodeHashToBase64,
  getSigningCredentials,
  InstallAppRequest,
  AppAuthenticationToken,
  AppCallZomeRequest,
  NetworkSeed,
} from "@holochain/client";
import getPort, { portNumbers } from "get-port";
import pick from "lodash/pick.js";
import assert from "node:assert";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { URL } from "node:url";
import { v4 as uuidv4 } from "uuid";

import { makeLogger } from "../logger.js";
import { AgentsAppsOptions, AppOptions, IConductor } from "../types.js";
import { _ALLOWED_ORIGIN } from "../common.js";

const logger = makeLogger("Local Conductor");

const HOST_URL = new URL("ws://localhost");
const DEFAULT_TIMEOUT = 60000;
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
   * The network type the conductor should use.
   *
   * @defaultValue quic
   */
  networkType?: NetworkType;

  /**
   * A bootstrap server URL for peers to discover each other.
   */
  bootstrapServerUrl?: URL;

  /**
   * Disable DPKI in the conductor instance.
   */
  noDpki?: boolean;

  /**
   * Set a DPKI network seed in the conductor instance.
   */
  dpkiNetworkSeed?: NetworkSeed;

  /**
   * Timeout for requests to Admin and App API.
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
  | "bootstrapServerUrl"
  | "networkType"
  | "noDpki"
  | "dpkiNetworkSeed"
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
export const createConductor = async (
  signalingServerUrl: URL,
  options?: ConductorOptions
) => {
  const createConductorOptions: CreateConductorOptions = pick(options, [
    "bootstrapServerUrl",
    "networkType",
    "noDpki",
    "dpkiNetworkSeed",
    "timeout",
  ]);
  const conductor = await Conductor.create(
    signalingServerUrl,
    createConductorOptions
  );
  if (options?.startup !== false) {
    await conductor.startUp();
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
  private _adminWs: AdminWebsocket | undefined;
  private _appWs: AppWebsocket | undefined;
  private readonly timeout: number;

  private constructor(timeout?: number) {
    this.conductorProcess = undefined;
    this.conductorDir = undefined;
    this.adminApiUrl = new URL(HOST_URL.href);
    this._adminWs = undefined;
    this._appWs = undefined;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Factory to create a conductor.
   *
   * @returns A configured instance of a conductor, not yet running.
   */
  static async create(
    signalingServerUrl: URL,
    options?: CreateConductorOptions
  ) {
    const networkType = options?.networkType ?? NetworkType.WebRtc;
    if (options?.bootstrapServerUrl && networkType !== NetworkType.WebRtc) {
      throw new Error(
        "error creating conductor: bootstrap service can only be set for webrtc network"
      );
    }

    const args = ["sandbox", "--piped", "create", "--in-process-lair"];
    // Set "no-dpki" flag when passed.
    if (options?.noDpki) {
      args.push("--no-dpki");
    }
    if (options?.dpkiNetworkSeed) {
      args.push("--dpki-network-seed", options.dpkiNetworkSeed);
    }
    args.push("network");
    if (options?.bootstrapServerUrl) {
      args.push("--bootstrap", options.bootstrapServerUrl.href);
    }
    args.push(networkType);
    if (networkType === NetworkType.WebRtc) {
      args.push(signalingServerUrl.href);
    }
    const createConductorProcess = spawn("hc", args);
    createConductorProcess.stdin.write(LAIR_PASSWORD);
    createConductorProcess.stdin.end();

    const conductor = new Conductor(options?.timeout);
    const createConductorPromise = new Promise<Conductor>((resolve, reject) => {
      createConductorProcess.stdout.on("data", (data: Buffer) => {
        logger.debug(`creating conductor config\n${data.toString()}`);
        const tmpDirMatches = [
          ...data.toString().matchAll(/ConfigRootPath\("(.*?)"\)/g),
        ];
        if (tmpDirMatches.length) {
          conductor.conductorDir = tmpDirMatches[0][1];
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

    const runConductorProcess = spawn("hc", [
      "sandbox",
      "--piped",
      "run",
      "-e",
      this.conductorDir,
    ]);
    runConductorProcess.stdin.write(LAIR_PASSWORD);
    runConductorProcess.stdin.end();

    const startPromise = new Promise<void>((resolve) => {
      runConductorProcess.stdout.on("data", (data: Buffer) => {
        const conductorLaunched = data
          .toString()
          .match(/Conductor launched #!\d ({.*})/);
        const holochainRunning = data
          .toString()
          .includes("Connected successfully to a running holochain");
        if (conductorLaunched || holochainRunning) {
          if (conductorLaunched) {
            const portConfiguration = JSON.parse(conductorLaunched[1]);
            const adminPort = portConfiguration.admin_port;
            this.adminApiUrl.port = adminPort;
            logger.debug(`starting conductor\n${data}`);
          }
          if (holochainRunning) {
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
      this.conductorProcess.kill("SIGINT");
    });
    return conductorShutDown;
  }

  private async connectAdminWs() {
    this._adminWs = await AdminWebsocket.connect({
      url: this.adminApiUrl,
      wsClientOptions: { origin: _ALLOWED_ORIGIN },
      defaultTimeout: this.timeout,
    });
    logger.debug(`connected to Admin API @ ${this.adminApiUrl.href}\n`);
  }

  /**
   * Attach a web socket to the App API.
   *
   * @param request - Specify a port for the web socket (optional).
   * @returns The app interface port.
   */
  async attachAppInterface(request?: AttachAppInterfaceRequest) {
    request = request ?? {
      port: await getPort({ port: portNumbers(30000, 40000) }),
      allowed_origins: _ALLOWED_ORIGIN,
    };
    logger.debug(`attaching App API to port ${request.port}\n`);
    const { port } = await this.adminWs().attachAppInterface(request);
    return port;
  }

  /**
   * Connect a web socket to the App API,
   *
   * @param token - A token to authenticate the connection.
   * @param port - The websocket port to connect to.
   * @returns An app websocket.
   */
  async connectAppWs(token: AppAuthenticationToken, port: number) {
    logger.debug(`connecting App WebSocket to port ${port}\n`);
    const appApiUrl = new URL(this.adminApiUrl.href);
    appApiUrl.port = port.toString();
    const appWs = await AppWebsocket.connect({
      token,
      url: appApiUrl,
      wsClientOptions: { origin: _ALLOWED_ORIGIN },
      defaultTimeout: this.timeout,
    });

    // set up automatic zome call signing
    const callZome = appWs.callZome.bind(appWs);
    appWs.callZome = async (req: AppCallZomeRequest, timeout?: number) => {
      let cellId;
      if ("role_name" in req) {
        assert(appWs.cachedAppInfo);
        cellId = appWs.getCellIdFromRoleName(
          req.role_name,
          appWs.cachedAppInfo
        );
      } else {
        cellId = req.cell_id;
      }
      if (!getSigningCredentials(cellId)) {
        await this.adminWs().authorizeSigningCredentials(cellId);
      }
      return callZome(req, timeout);
    };

    return appWs;
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
    return this.adminWs().installApp(installAppRequest);
  }

  /**
   * Install an app for multiple agents into the conductor.
   */
  async installAgentsApps(options: AgentsAppsOptions) {
    return Promise.all(
      options.agentsApps.map((appsForAgent) =>
        this.installApp(appsForAgent.app, {
          agentPubKey: appsForAgent.agentPubKey,
          membraneProofs: appsForAgent.membraneProofs,
          installedAppId: options.installedAppId,
          networkSeed: options.networkSeed,
        })
      )
    );
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
