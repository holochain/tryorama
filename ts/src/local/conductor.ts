import assert from "assert";
import getPort, { portNumbers } from "get-port";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { makeLogger } from "../logger";
import { v4 as uuidv4 } from "uuid";
import {
  AdminWebsocket,
  AppBundleSource,
  AppSignalCb,
  AppWebsocket,
  AttachAppInterfaceRequest,
  DnaSource,
  InstallAppBundleRequest,
  InstallAppDnaPayload,
} from "@holochain/client";
import { AgentHapp, Conductor, HappBundleOptions } from "../types";
import { URL } from "url";
import { enableAndGetAgentHapp } from "../common";

const logger = makeLogger("Local Conductor");

const HOST_URL = new URL("ws://127.0.0.1");
const DEFAULT_TIMEOUT = 15000;

export interface LocalConductorOptions {
  startup?: boolean;
  timeout?: number;
}

/**
 * The function to create a Local Conductor. It starts a sandbox conductor via
 * the Holochain CLI.
 *
 * @returns A local conductor instance.
 *
 * @public
 */
export const createLocalConductor = async (options?: LocalConductorOptions) => {
  const conductor = await LocalConductor.create(options?.timeout);
  if (options?.startup !== false) {
    await conductor.startUp();
  }
  return conductor;
};

/**
 * @public
 */
export class LocalConductor implements Conductor {
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

  static async create(timeout?: number) {
    const localConductor = new LocalConductor(timeout);
    const createConductorProcess = spawn("hc", [
      "sandbox",
      "create",
      "network",
      "mdns",
    ]);
    const createConductorPromise = new Promise<LocalConductor>(
      (resolve, reject) => {
        createConductorProcess.stdout.on("data", (data: Buffer) => {
          logger.debug(`creating conductor config\n${data.toString()}`);
          const tmpDirMatches = data.toString().match(/Created (\[".+"])/);
          if (tmpDirMatches) {
            localConductor.conductorDir = JSON.parse(tmpDirMatches[1])[0];
          }
        });
        createConductorProcess.stdout.on("end", () => {
          resolve(localConductor);
        });
        createConductorProcess.on("error", (err) => {
          logger.error(`error when creating conductor config: ${err}\n`);
          reject(err);
        });
      }
    );
    return createConductorPromise;
  }

  async startUp() {
    assert(
      this.conductorDir,
      "error starting conductor: conductor has not been created"
    );
    const runConductorProcess = spawn(
      "hc",
      ["sandbox", "run", "-e", this.conductorDir],
      {
        detached: true, // without this option, killing the process doesn't kill the conductor
      }
    );
    const startPromise = new Promise<void>((resolve, reject) => {
      runConductorProcess.stdout.on("data", (data: Buffer) => {
        logger.debug(`starting conductor\n${data}`);

        const numberMatches = data
          .toString()
          .match(/Running conductor on admin port (\d+)/);
        if (numberMatches) {
          this.adminApiUrl.port = numberMatches[1];
          logger.debug(`admin port ${this.adminApiUrl.port}\n`);
        }

        if (
          data
            .toString()
            .includes("Connected successfully to a running holochain")
        ) {
          // this is the last output of the startup process
          this.conductorProcess = runConductorProcess;
          resolve();
        }
      });

      runConductorProcess.stderr.once("data", (data: Buffer) => {
        logger.error(`error when starting conductor: ${data.toString()}`);
        reject(data);
      });
    });
    await startPromise;
    await this.connectAdminWs();
  }

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

  async attachAppInterface(request?: AttachAppInterfaceRequest) {
    request = request ?? {
      port: await getPort({ port: portNumbers(30000, 40000) }),
    };
    logger.debug(`attaching App API to port ${request.port}\n`);
    const { port } = await this.adminWs().attachAppInterface(request);
    this.appApiUrl.port = port.toString();
  }

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

  adminWs() {
    assert(this._adminWs, "admin ws has not been connected");
    return this._adminWs;
  }

  appWs() {
    assert(this._appWs, "app ws has not been connected");
    return this._appWs;
  }

  async installAgentsHapps(options: {
    agentsDnas: DnaSource[][];
    uid?: string;
  }) {
    const agentsHapps: AgentHapp[] = [];

    for (const agent of options.agentsDnas) {
      const dnas: InstallAppDnaPayload[] = [];
      const agentPubKey = await this.adminWs().generateAgentPubKey();
      const appId = `app-${uuidv4()}`;

      for (const dna of agent) {
        if ("path" in dna) {
          const dnaHash = await this.adminWs().registerDna({
            path: dna.path,
            uid: options.uid,
          });
          dnas.push({
            hash: dnaHash,
            role_id: `${dna.path}-${uuidv4()}`,
          });
        } else if ("hash" in dna) {
          const dnaHash = await this.adminWs().registerDna({
            hash: dna.hash,
            uid: options.uid,
          });
          dnas.push({
            hash: dnaHash,
            role_id: `dna-${uuidv4()}`,
          });
        } else {
          const dnaHash = await this.adminWs().registerDna({
            bundle: dna.bundle,
            uid: options.uid,
          });
          dnas.push({
            hash: dnaHash,
            role_id: `${dna.bundle.manifest.name}-${uuidv4()}`,
          });
        }
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
