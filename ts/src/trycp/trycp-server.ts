import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { makeLogger } from "../logger";

const logger = makeLogger("TryCP server");

export const TRYCP_SERVER_HOST = "0.0.0.0";
export const TRYCP_SERVER_PORT = 9000;
export const DEFAULT_PARTIAL_PLAYER_CONFIG = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network: ~`;

/**
 * Tryorama Control Protocol (TryCP) server
 *
 * TryCP is a protocol to enable remote management of Holochain conductors on network hosts.
 * This class is a factory class to spawn local instances of the TryCP server.
 */
export class TryCpServer {
  private serverProcess: ChildProcessWithoutNullStreams;

  private constructor(port: number) {
    this.serverProcess = spawn(
      "cargo",
      [
        "run",
        "--release",
        "--target-dir",
        "../../target",
        "--",
        "-p",
        port.toString(),
      ],
      { cwd: "crates/trycp_server" }
    );
  }

  /**
   * Spawns and starts a local TryCP server on the specified port.
   *
   * @param port - the network port the server should listen on
   * @returns a promise that resolves to the newly created server instance
   */
  static async start(port = TRYCP_SERVER_PORT) {
    const tryCpServer = new TryCpServer(port);

    tryCpServer.serverProcess.on("error", (err) =>
      logger.error(`Error starting up local TryCP server - ${err}`)
    );

    tryCpServer.serverProcess.stderr.on("data", (data) => {
      logger.debug(`build process - ${data}`);
    });

    const trycpPromise = new Promise<TryCpServer>((resolve) =>
      tryCpServer.serverProcess.stdout.on("data", (data) => {
        const regexServerStarted = new RegExp(
          `Listening on ${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
        );
        if (/error/i.test(data)) {
          logger.error(data);
          return;
        }
        if (regexServerStarted.test(data)) {
          logger.verbose(data);
          resolve(tryCpServer);
          return;
        }
        logger.debug(data);
      })
    );
    return trycpPromise;
  }

  /**
   * Stops the server instance by killing the server process.
   *
   * @returns a promise that resolves when the process has exited
   */
  async stop() {
    const killPromise = new Promise<void>((resolve) => {
      this.serverProcess.on("exit", (code) => {
        logger.debug(`exited with code ${code}`);
        resolve();
      });
    });
    this.serverProcess.kill("SIGTERM");
    return killPromise;
  }
}
