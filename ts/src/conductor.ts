import {
  AdminWebsocket,
  AppAuthenticationToken,
  AppWebsocket,
  AttachAppInterfaceRequest,
  CallZomeRequest,
  encodeHashToBase64,
  getSigningCredentials,
  InstallAppRequest,
  RoleNameCallZomeRequest,
} from "@holochain/client";
import getPort, { portNumbers } from "get-port";
import yaml from "js-yaml";
import pick from "lodash/pick.js";
import assert from "node:assert";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { URL } from "node:url";
import { v4 as uuidv4 } from "uuid";
import { _ALLOWED_ORIGIN } from "./conductor-helpers.js";
import { makeLogger } from "./logger.js";
import { AppWithOptions } from "./scenario.js";
import { AgentsAppsOptions } from "./types.js";

const logger = makeLogger();

/**
 * @public
 */
export const CONDUCTOR_CONFIG = "conductor-config.yaml";
const HOST_URL = new URL("ws://localhost");
const DEFAULT_TIMEOUT = 60000;
const LAIR_PASSWORD = "lair-password\n";

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
   * A bootstrap server URL for peers to discover each other.
   */
  bootstrapServerUrl?: URL;

  /**
   * Timeout for requests to Admin and App API.
   */
  timeout?: number;
}

/**
 * @public
 */
export interface NetworkConfig {
  /**
   * The interval in seconds between initiating gossip rounds.
   *
   * This controls how often gossip will attempt to find a peer to gossip with.
   * This can be set as low as you'd like, but you will still be limited by
   * minInitiateIntervalMs. So a low value for this will result in gossip
   * doing its initiation in a burst. Then, when it has run out of peers, it will idle
   * for a while.
   *
   * Default: 100
   */
  initiateIntervalMs?: number;

  /**
   * The minimum amount of time that must be allowed to pass before a gossip round can be
   * initiated by a given peer.
   *
   * This is a rate-limiting mechanism to be enforced against incoming gossip and therefore must
   * be respected when initiating too.
   *
   * Default: 100
   */
  minInitiateIntervalMs?: number;

  /**
   * A jitter value to add to the `initiateIntervalMs`.
   *
   * This is used to avoid peers always being the gossip initiator or acceptor. It can be
   * set to `0` to disable jitter, but it is recommended to leave this at the default value.
   *
   * Default: 30
   */
  initiateJitterMs?: number;

  /**
   * The timeout for a round of gossip.
   *
   * This is the maximum amount of time that a gossip round is allowed to take.
   *
   * Default: 10,000
   */
  roundTimeoutMs?: number;

  /**
   * The network timeout for transport operations.
   *
   * This controls how long Holochain will spend waiting for connections to be established and
   * other low-level network operations.
   *
   * If you are writing tests that start and stop conductors, you may want to set this to a lower
   * value to avoid waiting for connections to conductors that are no longer running.
   *
   * Default: 15
   */
  transportTimeoutS?: number;

  /**
   * The target arc factor for gossip.
   *
   * This controls the range of DHT locations that the peer will aim to store and serve during gossip.
   *
   * For leacher nodes that do not contribute to gossip, set to zero.
   *
   * Default: 1
   */

  targetArcFactor?: number;
}

/**
 * Conductor Configuration YAML
 * 
 * These types are a subset of the actual conductor configuration,
 * only including fields that can be overridden via the options of `addPlayerWithApps`.
 */

type NetworkAdvancedK2GossipConfigYaml = Omit<NetworkConfig, 'targetArcFactor'|'timeoutS'>;

interface NetworkAdvancedTx5TransportConfigYaml {
  signalAllowPlainText: boolean;
  timeoutS: number;
}

interface ConductorConfigYaml {
  network: {
    advanced: {
      k2Gossip: NetworkAdvancedK2GossipConfigYaml,
      tx5Transport: NetworkAdvancedTx5TransportConfigYaml
    };
    target_arc_factor: number;
  };
}

/**
 * Options for using the conductor factory.
 *
 * @public
 */
export type CreateConductorOptions = Pick<
  ConductorOptions,
  "bootstrapServerUrl" | "timeout"
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
  options?: ConductorOptions & NetworkConfig,
) => {
  const createConductorOptions: CreateConductorOptions = pick(options, [
    "bootstrapServerUrl",
    "timeout",
  ]);
  const conductor = await Conductor.create(
    signalingServerUrl,
    createConductorOptions,
  );
  const networkConfig: NetworkConfig = pick(options, [
    "initiateIntervalMs",
    "minInitiateIntervalMs",
    "initiateJitterMs",
    "roundTimeoutMs",
    "transportTimeoutS",
    "targetArcFactor",
  ]);
  conductor.setNetworkConfig(networkConfig);
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
export class Conductor {
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
    options?: CreateConductorOptions,
  ) {
    const args = ["sandbox", "--piped", "create", "--in-process-lair"];
    args.push("network");
    if (options?.bootstrapServerUrl) {
      args.push("--bootstrap", options.bootstrapServerUrl.href);
    }
    args.push("webrtc");
    args.push(signalingServerUrl.href);
    logger.debug("spawning hc sandbox with args:", args);
    const createConductorProcess = spawn("hc", args);
    createConductorProcess.stdin.write(LAIR_PASSWORD);
    createConductorProcess.stdin.end();

    const conductor = new Conductor(options?.timeout);
    return new Promise<Conductor>((resolve, reject) => {
      createConductorProcess.stdout.on("data", (data: Buffer) => {
        logger.debug(`creating conductor config\n${data.toString()}`);
        const tmpDirMatches = [
          ...data.toString().matchAll(/DataRootPath\("(.*?)"\)/g),
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
  }

  setNetworkConfig(createConductorOptions: NetworkConfig) {
    const conductorConfig = readFileSync(
      `${this.conductorDir}/${CONDUCTOR_CONFIG}`,
      "utf-8",
    );
    const conductorConfigYaml = yaml.load(conductorConfig) as ConductorConfigYaml;
    assert(conductorConfigYaml && typeof conductorConfigYaml === "object");
    assert(
      "network" in conductorConfigYaml &&
        conductorConfigYaml.network &&
        typeof conductorConfigYaml.network === "object",
    );
    if ("mem_bootstrap" in conductorConfigYaml.network) {
      delete conductorConfigYaml.network.mem_bootstrap;
    }
    conductorConfigYaml.network.target_arc_factor =
      createConductorOptions.targetArcFactor ?? 1;
    assert("advanced" in conductorConfigYaml.network);
    conductorConfigYaml.network.advanced = {
      k2Gossip: {
        initiateIntervalMs: createConductorOptions.initiateIntervalMs ?? 100,
        minInitiateIntervalMs:
          createConductorOptions.minInitiateIntervalMs ?? 100,
        initiateJitterMs: createConductorOptions.initiateJitterMs ?? 30,
        roundTimeoutMs: createConductorOptions.roundTimeoutMs ?? 10_000,
      },
      tx5Transport: {
        signalAllowPlainText: true,
        timeoutS: createConductorOptions.transportTimeoutS ?? 15,
      },
    };
    const yamlDump = yaml.dump(conductorConfigYaml);
    logger.debug("Updated conductor config:");
    logger.debug(yamlDump);
    writeFileSync(`${this.conductorDir}/${CONDUCTOR_CONFIG}`, yamlDump);
  }

  /**
   * Start the conductor and establish a web socket connection to the Admin
   * API.
   */
  async startUp() {
    assert(
      this.conductorDir,
      "error starting conductor: conductor has not been created",
    );
    if (this.conductorProcess) {
      logger.error("error starting conductor: conductor is already running\n");
      return;
    }

    const runConductorProcess = spawn("holochain", [
      "--piped",
      "-c",
      `${this.conductorDir}/${CONDUCTOR_CONFIG}`,
    ]);
    runConductorProcess.stdin.write(LAIR_PASSWORD);
    runConductorProcess.stdin.end();

    const startPromise = new Promise<void>((resolve) => {
      runConductorProcess.stdout.on("data", (data: Buffer) => {
        logger.info(data.toString());
        const conductorLaunched = data.toString().match(/Conductor ready\./);
        if (conductorLaunched) {
          // This is the last output of the startup process.
          const adminPort = data.toString().match(/###ADMIN_PORT:(\d*)###/);
          assert(adminPort);
          this.adminApiUrl.port = adminPort[1];
          this.conductorProcess = runConductorProcess;
          resolve();
        }
      });

      runConductorProcess.stderr.on("data", (data: Buffer) => {
        logger.error(data.toString());
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
    if (this._adminWs) {
      await this._adminWs.client.close();
      this._adminWs = undefined;
    }
    if (this._appWs) {
      await this._appWs.client.close();
      this._appWs = undefined;
    }

    logger.debug("shutting down conductor\n");
    return new Promise<number | null>((resolve) => {
      assert(this.conductorProcess);
      // Kill process after timeout if terminating didn't succeed.
      const timer = setTimeout(() => {
        this.conductorProcess?.kill("SIGKILL");
      }, 5_000);
      this.conductorProcess.addListener("close", (code) => {
        clearTimeout(timer);
        this.conductorProcess?.removeAllListeners();
        this.conductorProcess?.stdout.removeAllListeners();
        this.conductorProcess?.stderr.removeAllListeners();
        this.conductorProcess = undefined;
        resolve(code);
      });
      this.conductorProcess.kill("SIGTERM");
    });
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
    appWs.callZome = async (
      req: CallZomeRequest | RoleNameCallZomeRequest,
      timeout?: number,
    ) => {
      let cellId;
      if ("role_name" in req) {
        assert(appWs.cachedAppInfo);
        cellId = appWs.getCellIdFromRoleName(
          req.role_name,
          appWs.cachedAppInfo,
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
  async installApp(appWithOptions: AppWithOptions) {
    const agent_key =
      appWithOptions.options?.agentPubKey ??
      (await this.adminWs().generateAgentPubKey());
    const installed_app_id =
      appWithOptions.options?.installedAppId ?? `app-${uuidv4()}`;
    const roles_settings = appWithOptions.options?.rolesSettings;
    const network_seed = appWithOptions.options?.networkSeed;
    const installAppRequest: InstallAppRequest = {
      source: appWithOptions.appBundleSource,
      agent_key,
      roles_settings,
      installed_app_id,
      network_seed,
    };
    logger.debug(
      `installing app with id ${installed_app_id} for agent ${encodeHashToBase64(
        agent_key,
      )}`,
    );
    return this.adminWs().installApp(installAppRequest);
  }

  /**
   * Install an app for multiple agents into the conductor.
   */
  async installAgentsApps(options: AgentsAppsOptions) {
    return Promise.all(
      options.agentsApps.map((appsForAgent) => this.installApp(appsForAgent)),
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
  return new Promise<void>((resolve) => {
    conductorProcess.stdout.once("end", () => {
      logger.debug("sandbox conductors cleaned\n");
      resolve();
    });
  });
};
