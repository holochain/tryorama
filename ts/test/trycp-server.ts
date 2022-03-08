import msgpack from "@msgpack/msgpack";
import test from "tape-promise/tape";
import { Buffer } from "buffer";
import {
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
  TryCpServer,
  DEFAULT_PARTIAL_PLAYER_CONFIG,
} from "../src/trycp/trycp-server";
import { TryCpClient } from "../src/trycp/trycp-client";
import {
  RequestAdminInterfaceData,
  TRYCP_RESPONSE_SUCCESS,
} from "../src/trycp/types";
import { decodeTryCpAdminApiResponse } from "../src/trycp/util";

const createTryCpClient = () =>
  TryCpClient.create(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);

test("TryCP - ping", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.close();
  await localTryCpServer.stop();

  t.equal(actual, expected);
});

test("TryCP call - non-existent call throws", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const actual = tryCpClient.call({
    // eslint-disable-next-line
    // @ts-ignore
    type: "non-call",
  });
  // eslint-disable-next-line
  // @ts-ignore
  t.throws(actual);

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP call - download DNA from web", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const url =
    "https://github.com/holochain/elemental-chat/releases/download/v0.0.1-alpha15/elemental-chat.dna.gz";
  const expectedUrl = url.replace(/https?:\/\/.*?\//g, "").replace(/\//g, "");
  const actualUrl = await tryCpClient.call({
    type: "download_dna",
    url,
  });
  await tryCpClient.close();
  await localTryCpServer.stop();

  t.ok(typeof actualUrl === "string" && actualUrl.endsWith(expectedUrl));
});

test("TryCP call - download DNA from file system", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const url =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/test.dna";
  const expectedUrl = url.replace(/file:/, "").replace(/\//g, "");
  const actualUrl = await tryCpClient.call({
    type: "download_dna",
    url,
  });
  await tryCpClient.close();
  await localTryCpServer.stop();

  t.ok(typeof actualUrl === "string" && actualUrl.endsWith(expectedUrl));
});

test("TryCP call - save DNA to file system", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const dnaId = "dna-1";
  const actualUrl = await tryCpClient.call({
    type: "save_dna",
    id: dnaId,
    content: Buffer.from([0, 1, 2, 3, 4]),
  });
  await tryCpClient.close();
  await localTryCpServer.stop();

  t.ok(typeof actualUrl === "string" && actualUrl.endsWith(dnaId));
});

test("TryCP call - configure player", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const actual = await tryCpClient.call({
    type: "configure_player",
    id: "player-1",
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.close();
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
  await tryCpClient.close();
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
  await tryCpClient1.close();
  await tryCpClient2.close();
  await localTryCpServer.stop();

  t.equal(response1, TRYCP_RESPONSE_SUCCESS);
  t.equal(response2, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP call - startup and shutdown", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  const actualStartup = await tryCpClient.call({
    type: "startup",
    id: playerId,
  });

  const actualShutdown = await tryCpClient.call({
    type: "shutdown",
    id: playerId,
  });

  await tryCpClient.close();
  await localTryCpServer.stop();

  t.equal(actualStartup, TRYCP_RESPONSE_SUCCESS);
  t.equal(actualShutdown, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP call - reset", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.call({
    type: "startup",
    id: playerId,
  });

  const actual = await tryCpClient.call({
    type: "reset",
  });
  const attemptToStartAgain = tryCpClient.call({
    type: "startup",
    id: playerId,
  });
  t.rejects(attemptToStartAgain);

  await tryCpClient.close();
  await localTryCpServer.stop();

  t.equal(actual, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP call - call admin interface", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.call({
    type: "startup",
    id: playerId,
  });

  const response = await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode({ type: "generate_agent_pub_key" }),
  });
  const actual = decodeTryCpAdminApiResponse(response);
  const actualAgentPubKey = Buffer.from(actual.data).toString("base64");

  await tryCpClient.call({
    type: "shutdown",
    id: playerId,
  });

  await tryCpClient.close();
  await localTryCpServer.stop();

  t.equal(actual.type, "agent_pub_key_generated");
  t.ok(actualAgentPubKey.startsWith("hCAk"));
  t.equal(actualAgentPubKey.length, 52);
});

test("TryCP call - connect app interface", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.call({
    type: "startup",
    id: playerId,
  });

  const port = TRYCP_SERVER_PORT + 50;
  const adminRequestData: RequestAdminInterfaceData = {
    type: "attach_app_interface",
    data: { port },
  };
  await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode(adminRequestData),
  });

  const actual = await tryCpClient.call({
    type: "connect_app_interface",
    port,
  });

  await tryCpClient.call({
    type: "shutdown",
    id: playerId,
  });
  await tryCpClient.close();
  await localTryCpServer.stop();

  t.equal(actual, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP call - disconnect app interface", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.call({
    type: "startup",
    id: playerId,
  });

  const port = TRYCP_SERVER_PORT + 50;
  const adminRequestData: RequestAdminInterfaceData = {
    type: "attach_app_interface",
    data: { port },
  };
  await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode(adminRequestData),
  });
  await tryCpClient.call({
    type: "connect_app_interface",
    port,
  });

  const actual = await tryCpClient.call({
    type: "disconnect_app_interface",
    port,
  });

  await tryCpClient.call({
    type: "shutdown",
    id: playerId,
  });
  await tryCpClient.close();
  await localTryCpServer.stop();

  t.equal(actual, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP call - call app interface", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.call({
    type: "startup",
    id: playerId,
  });

  const port = TRYCP_SERVER_PORT + 50;
  const adminRequestData: RequestAdminInterfaceData = {
    type: "attach_app_interface",
    data: { port },
  };
  await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode(adminRequestData),
  });
  await tryCpClient.call({
    type: "connect_app_interface",
    port,
  });

  const response = await tryCpClient.call({
    type: "call_app_interface",
    port,
    message: msgpack.encode({
      type: "app_info",
      data: { installed_app_id: "no_happ_installed" },
    }),
  });
  const actual = decodeTryCpAdminApiResponse(response);

  await tryCpClient.call({
    type: "shutdown",
    id: playerId,
  });
  await tryCpClient.close();
  await localTryCpServer.stop();

  t.equal(actual.type, "app_info");
  t.equal(actual.data, null);
});
