// import { AdminWebsocket } from "@holochain/client";
import test from "tape";
import {
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
  TryCpServer,
  DEFAULT_PARTIAL_PLAYER_CONFIG,
} from "../src/trycp/trycp-server";
import { TryCpClient } from "../src/trycp/trycp-client";

const createTryCpClient = () =>
  TryCpClient.create(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);

test("TryCP ping", async (assert) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.destroy();
  await localTryCpServer.stop();

  assert.equal(actual, expected);
});

test.only("TryCP call - configure player", async (assert) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const expectedRequestId = 1;
  const actual = await tryCpClient.call({
    id: expectedRequestId,
    request: {
      type: "configure_player",
      id: "player1",
      partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
    },
  });
  await tryCpClient.destroy();
  await localTryCpServer.stop();

  assert.equal(actual.id, expectedRequestId);
  assert.equal(actual.type, "response");
  assert.equal(actual.response[0], null);
});
