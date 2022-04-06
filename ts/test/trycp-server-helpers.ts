import test from "tape-promise/tape";
import { installAgentsHapps, TryCpServer } from "../src";

test("Install agents and hApps", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { conductor } = await installAgentsHapps(
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/entry.dna"
  );
  t.ok(conductor);
  await conductor.destroy();
  await localTryCpServer.stop();
});
