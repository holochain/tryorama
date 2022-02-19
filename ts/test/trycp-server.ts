// import { AdminWebsocket } from "@holochain/client";
import test from "tape";
import {
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
  TryCpServer,
  DEFAULT_PARTIAL_PLAYER_CONFIG,
} from "../src/trycp/trycp-server";
import { TryCpClient } from "../src/trycp/trycp-client";
import { TRYCP_RESPONSE_SUCCESS } from "../src/trycp/types";

const createTryCpClient = () =>
  TryCpClient.create(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);

test("TryCP - ping", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.equal(actual, expected);
});

test("TryCP call - configure player", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const actual = await tryCpClient.call({
    type: "configure_player",
    id: "player-1",
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.equal(actual, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP - 2 parallel calls from one client return corresponding responses", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const parallelCallPromises = [
    tryCpClient.call({
      type: "configure_player",
      id: "player-1",
      partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
    }),
    tryCpClient.call({
      type: "configure_player",
      id: "player-2",
      partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
    }),
  ];
  const [response1, response2] = await Promise.all(parallelCallPromises);
  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.equal(response1, TRYCP_RESPONSE_SUCCESS);
  t.equal(response2, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP - 2 parallel calls from two clients return correct responses", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient1 = await createTryCpClient();
  const tryCpClient2 = await createTryCpClient();

  const parallelCallPromises = [
    tryCpClient1.call({
      type: "configure_player",
      id: "player-1",
      partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
    }),
    tryCpClient2.call({
      type: "configure_player",
      id: "player-2",
      partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
    }),
  ];
  const [response1, response2] = await Promise.all(parallelCallPromises);
  await tryCpClient1.destroy();
  await tryCpClient2.destroy();
  await localTryCpServer.stop();

  t.equal(response1, TRYCP_RESPONSE_SUCCESS);
  t.equal(response2, TRYCP_RESPONSE_SUCCESS);
});

test.skip("TryCP call - startup", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });

  const actual = await tryCpClient.call({
    type: "startup",
    id: playerId,
  });
  await tryCpClient.destroy();
  await localTryCpServer.stop();

  console.log("actual", actual);
  t.equal(true, true);
});
