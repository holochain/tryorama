import test from "tape-promise/tape";
import { installAgentsHapps, TryCpServer } from "../../src";
import { FIXTURE_DNA_URL } from "../fixture";

test("Install agents and hApps", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const { conductor } = await installAgentsHapps(FIXTURE_DNA_URL);
  t.ok(conductor);
  await conductor.destroy();
  await localTryCpServer.stop();
});
