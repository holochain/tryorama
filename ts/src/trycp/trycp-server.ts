import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { makeLogger } from "../logger";

const logger = makeLogger("TryCP server");

export const PORT = 9000;

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

  static async start(port = PORT) {
    const tryCpServer = new TryCpServer(port);

    tryCpServer.serverProcess.stderr.on("data", (data) => {
      logger.info(`build process - ${data}`);
    });

    const trycpPromise = new Promise<TryCpServer>((resolve) =>
      tryCpServer.serverProcess.stdout.on("data", (data) => {
        const regex = new RegExp("Listening on 0.0.0.0:" + port);
        if (regex.test(data)) {
          logger.debug("started");
          resolve(tryCpServer);
        }
        logger.info(data);
      })
    );
    return trycpPromise;
  }

  async stop() {
    // TODO send stop signal
    this.serverProcess.on("exit", (code) => logger.info(`exit code ${code}`));
    this.serverProcess.kill("SIGINT");
  }
}
