import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { makeLogger } from "../logger.js";

const logger = makeLogger("TryCP server");
const serverError = new RegExp(
  /(internal_error|Error serving client from address)/i
);

/**
 * Default TryCP server host address.
 *
 * @public
 */
export const TRYCP_SERVER_HOST = "0.0.0.0";
/**
 * Default TryCP server port.
 *
 * @public
 */
export const TRYCP_SERVER_PORT = 9000;

/**
 * A factory class to start and stop local instances of the TryCP server.
 *
 * @public
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
        "target",
        "--",
        "-p",
        port.toString(),
      ],
      { cwd: "crates/trycp_server" }
    );
  }

  /**
   * Builds and starts a local TryCP server on the specified port.
   *
   * @param port - The network port the server should listen on.
   * @returns A promise that resolves to the newly created server instance.
   */
  static async start(port = TRYCP_SERVER_PORT) {
    const tryCpServer = new TryCpServer(port);

    tryCpServer.serverProcess.on("error", (err) =>
      logger.error(`Error starting up local TryCP server - ${err}`)
    );

    // the build output from cargo is written to stderr instead of stdout
    tryCpServer.serverProcess.stderr.on("data", (data) => {
      logger.debug(`build process - ${data}`);
    });

    const trycpPromise = new Promise<TryCpServer>((resolve) =>
      tryCpServer.serverProcess.stdout.on("data", (data) => {
        if (serverError.test(data)) {
          logger.error(data);
          return;
        }
        const regexServerStarted = new RegExp("Listening on");
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
   * @returns A promise that resolves when the process has exited.
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

/**
 * Shortcut function to stop all TryCP servers.
 *
 * @public
 */
export const stopAllTryCpServers = async (tryCpServers: TryCpServer[]) =>
  Promise.all(tryCpServers.map((tryCpServer) => tryCpServer.stop()));
