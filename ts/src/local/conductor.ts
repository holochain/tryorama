import assert from "assert";
import getPort, { portNumbers } from "get-port";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { makeLogger } from "../logger";
import { v4 as uuidv4 } from "uuid";
import {
  AdminWebsocket,
  AppSignalCb,
  AppWebsocket,
  AttachAppInterfaceRequest,
  CallZomeRequest,
  CallZomeResponse,
  DnaHash,
  DnaSource,
} from "@holochain/client";
import { AgentHapp, CellZomeCallRequest, Conductor } from "../types";
import { URL } from "url";

const logger = makeLogger("Local conductor");

const HOST_URL = new URL("ws://127.0.0.1");

export interface LocalConductorOptions {
  startup?: boolean;
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
  const conductor = await LocalConductor.create();
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

  private constructor() {
    this.conductorProcess = undefined;
    this.conductorDir = undefined;
    this.adminApiUrl = new URL(HOST_URL.href);
    this.appApiUrl = new URL(HOST_URL.href);
    this._adminWs = undefined;
    this._appWs = undefined;
  }

  static async create() {
    const localConductor = new LocalConductor();
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
          resolve();
        }
      });

      runConductorProcess.stderr.on("data", (data: Buffer) => {
        logger.error(`error when starting conductor: ${data.toString()}`);
        reject(data);
      });

      runConductorProcess.on("error", (err) => {
        logger.error(`error when starting conductor: ${err}\n`);
        reject(err);
      });
    });
    this.conductorProcess = runConductorProcess;
    await startPromise;
    await this.connectAdminWs();
  }

  async shutDown() {
    if (this._adminWs) {
      await this._adminWs.client.close();
    }
    if (this._appWs) {
      await this._appWs.client.close();
    }
    const destroyPromise = new Promise<number | null>((resolve) => {
      assert(
        this.conductorProcess,
        "error destroying conductor: conductor is not running"
      );
      process.kill(-this.conductorProcess.pid);
      this.conductorProcess.on("exit", (code) => {
        resolve(code);
      });
    });
    return destroyPromise;
  }

  private async connectAdminWs() {
    this._adminWs = await AdminWebsocket.connect(this.adminApiUrl.href);
    logger.debug(`connected to Admin API @ ${this.adminApiUrl.href}\n`);
  }

  async connectAppInterface(signalHandler?: AppSignalCb) {
    assert(
      this.appApiUrl.port,
      "error connecting app interface: app api port has not been defined"
    );

    logger.debug(`connecting App API to port ${this.appApiUrl.port}\n`);
    this._appWs = await AppWebsocket.connect(
      this.appApiUrl.href,
      undefined,
      signalHandler
    );
  }

  async attachAppInterface(request?: AttachAppInterfaceRequest) {
    request = request ?? {
      port: await getPort({ port: portNumbers(30000, 40000) }),
    };
    logger.debug(`attaching App API to port ${request.port}\n`);
    const { port } = await this.adminWs().attachAppInterface(request);
    this.appApiUrl.port = port.toString();
  }

  adminWs() {
    assert(this._adminWs, "admin ws has not been connected");
    return this._adminWs;
  }

  appWs() {
    assert(this._appWs, "app ws has not been connected");
    return this._appWs;
  }

  async callZome<T>(request: CallZomeRequest) {
    try {
      const zomeResponse = await this.appWs().callZome(request);
      assertZomeResponse<T>(zomeResponse);
      return zomeResponse;
    } catch (error) {
      logger.error(
        `local app ws error - call zome:\n${JSON.stringify(error, null, 4)}`
      );
      throw error;
    }
  }

  async installAgentsHapps(options: {
    agentsDnas: DnaSource[][];
    uid?: string;
    signalHandler?: AppSignalCb;
  }) {
    const agentsCells: AgentHapp[] = [];

    for (const agent of options.agentsDnas) {
      const dnaHashes: DnaHash[] = [];
      const agentPubKey = await this.adminWs().generateAgentPubKey();
      const appId = `app-${uuidv4()}`;

      for (const dna of agent) {
        if ("path" in dna) {
          const dnaHash = await this.adminWs().registerDna({ path: dna.path });
          dnaHashes.push(dnaHash);
        } else if ("hash" in dna) {
          const dnaHash = await this.adminWs().registerDna({
            hash: dna.hash,
            uid: `dna-${uuidv4()}`,
          });
          dnaHashes.push(dnaHash);
        } else {
          throw new Error("no dna found like");
        }
      }

      const dnas = dnaHashes.map((dnaHash) => ({
        hash: dnaHash,
        role_id: `dna-${uuidv4()}`,
      }));

      const installedAppInfo = await this.adminWs().installApp({
        installed_app_id: appId,
        agent_key: agentPubKey,
        dnas,
      });
      const enableAppResponse = await this.adminWs().enableApp({
        installed_app_id: appId,
      });
      if (enableAppResponse.errors.length) {
        logger.error(`error enabling app\n${enableAppResponse.errors}`);
      }

      const cells = installedAppInfo.cell_data.map((cell) => ({
        ...cell,
        callZome: async <T>(request: CellZomeCallRequest) =>
          this.callZome<T>({
            ...request,
            cap_secret: request.cap_secret || null,
            cell_id: cell.cell_id,
            provenance: request.provenance || agentPubKey,
          }),
      }));

      agentsCells.push({
        happId: installedAppInfo.installed_app_id,
        agentPubKey,
        cells,
      });
    }
    await this.attachAppInterface();
    await this.connectAppInterface(options.signalHandler);

    return agentsCells;
  }
}

export const cleanAllConductors = async () => {
  const conductorProcess = spawn("hc", ["sandbox", "clean"]);
  const cleanPromise = new Promise<void>((resolve) => {
    conductorProcess.stdout.once("end", () => {
      logger.debug("sandboxed conductors cleaned\n");
      resolve();
    });
  });
  return cleanPromise;
};

function assertZomeResponse<T>(
  response: CallZomeResponse
): asserts response is T {
  return;
}
