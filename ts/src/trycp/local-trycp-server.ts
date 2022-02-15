import { ChildProcessWithoutNullStreams, spawn } from "child_process";

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
      console.error(`TryCP server compilation: ${data}`);
    });

    tryCpServer.serverProcess.stderr.on("error", (err) => {
      console.error(`TryCP server compilation error: ${err}`);
    });

    const trycpPromise = new Promise<TryCpServer>((resolve) =>
      tryCpServer.serverProcess.stdout.on("data", (data) => {
        const regex = new RegExp("Listening on 0.0.0.0:" + port);
        if (regex.test(data)) {
          resolve(tryCpServer);
        }
        console.log(`TryCP server output: ${data}`);
      })
    );
    return trycpPromise;
  }

  async stop() {
    // TODO send stop signal
    this.serverProcess.on("exit", (code) =>
      console.log(`TryCP server exit code ${code}`)
    );
    this.serverProcess.kill("SIGINT");
  }
}
