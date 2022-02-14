import { ChildProcessWithoutNullStreams, spawn } from "child_process";

export const PORT = 9000;

export const startLocalTryCpServer = async (
  port = PORT
): Promise<ChildProcessWithoutNullStreams> => {
  const trycp = spawn(
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

  trycp.stderr.on("data", (data) => {
    console.error(`TryCP Server stderr: ${data}`);
  });

  const trycpPromise = new Promise<ChildProcessWithoutNullStreams>((resolve) =>
    trycp.stdout.on("data", (data) => {
      const regex = new RegExp("Listening on 0.0.0.0:" + port);
      if (regex.test(data)) {
        resolve(trycp);
      }
      console.log(`TryCP Server stdout: ${data}`);
    })
  );
  return trycpPromise;
};
