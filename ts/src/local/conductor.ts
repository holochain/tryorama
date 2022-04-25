import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import assert from "assert";
import { makeLogger } from "../logger";
import { AdminWebsocket, AppWebsocket } from "@holochain/client";
import getPort, { portNumbers } from "get-port";

const logger = makeLogger("Local conductor");

/**
 * The function to create a Local Conductor. It starts a sandbox conductor via
 * the Holochain CLI.
 *
 * @returns A local conductor instance.
 *
 * @public
 */
export const createLocalConductor = async () => {
  const conductor = await LocalConductor.create();
  return conductor;
};

/**
 * @public
 */
export class LocalConductor {
  private conductorProcess: ChildProcessWithoutNullStreams | undefined;
  private conductorDir: string | undefined;
  private conductor: Awaited<ReturnType<typeof this.createClient>> | undefined;
  private adminInterfacePort: number | undefined;

  private constructor() {
    this.conductor = undefined;
    this.conductorProcess = undefined;
  }

  static async create() {
    const localConductor = new LocalConductor();
    const createConductorProcess = spawn("hc", ["sandbox", "create"]);
    const createConductorPromise = new Promise<LocalConductor>(
      (resolve, reject) => {
        createConductorProcess.stdout.on("data", (data: Buffer) => {
          logger.debug(`creating conductor config - ${data.toString()}\n`);
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

  private async createClient(url: string) {
    const adminWs = await AdminWebsocket.connect(url);
    logger.debug(`connected to Admin API @ ${url}\n`);

    const appApiPort = await getPort({ port: portNumbers(30000, 40000) });
    adminWs.attachAppInterface({ port: appApiPort });

    const adminApiUrl = new URL(url);
    const appApiUrl = `${adminApiUrl.protocol}//${adminApiUrl.hostname}:${appApiPort}`;
    const appWs = await AppWebsocket.connect(appApiUrl);

    const destroy = async () => {
      await appWs.client.close();
      await adminWs.client.close();
      logger.debug("disconnected from Admin API\n");
    };

    return { adminWs, appWs, destroy };
  }

  async start() {
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
    const startPromise = new Promise<number>((resolve, reject) => {
      runConductorProcess.stdout.on("data", (data: Buffer) => {
        logger.debug(`starting conductor\n${data}`);

        const numberMatches = data
          .toString()
          .match(/Running conductor on admin port (\d+)/);
        if (numberMatches) {
          this.adminInterfacePort = parseInt(numberMatches[1]);
          logger.debug(`admin port ${this.adminInterfacePort}\n`);
        }

        if (
          data
            .toString()
            .includes("Connected successfully to a running holochain")
        ) {
          assert(
            this.adminInterfacePort,
            "admin interface port has not been defined"
          );
          resolve(this.adminInterfacePort);
        }
      });

      runConductorProcess.on("error", (err) => {
        logger.error(`error when starting conductor: ${err}\n`);
        reject(err);
      });
    });
    this.conductorProcess = runConductorProcess;
    const adminApiPort = await startPromise;
    // this.conductor = await this.createClient(`ws://127.0.0.1:1${adminApiPort}`);
  }

  async destroy() {
    if (this.conductor) {
      await this.conductor.destroy();
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
}

export const cleanSandboxes = async () => {
  const conductorProcess = spawn("hc", ["sandbox", "clean"]);
  const cleanPromise = new Promise<void>((resolve) => {
    conductorProcess.stdout.once("end", () => {
      logger.debug("conductors cleaned\n");
      resolve();
    });
  });
  return cleanPromise;
};
