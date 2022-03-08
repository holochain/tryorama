import msgpack from "@msgpack/msgpack";
import test from "tape-promise/tape";
import assert from "assert";
import { Buffer } from "buffer";
import {
  TRYCP_SERVER_PORT,
  TryCpServer,
  DEFAULT_PARTIAL_PLAYER_CONFIG,
  TRYCP_SERVER_HOST,
} from "../src/trycp/trycp-server";
import { TryCpClient } from "../src/trycp/trycp-client";
import { RequestAdminInterfaceData } from "../src/trycp/types";
import {
  decodeAppApiResponse,
  decodeTryCpAdminApiResponse,
} from "../src/trycp/util";
import { CallZomeResponse } from "@holochain/client";

const createTryCpClient = () =>
  TryCpClient.create(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);

test.only("TryCP call - call admin interface", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  await tryCpClient.call({
    type: "reset",
  });

  const url =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/entry.dna";
  const relativePath = await tryCpClient.call({
    type: "download_dna",
    url,
  });

  const playerId = "player-1";

  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.call({
    type: "startup",
    id: playerId,
    log_level: "trace",
  });

  const actualRegisterDnaResponse = await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode({
      type: "register_dna",
      data: { path: relativePath },
    }),
  });
  const decodedRegisterDnaResponse = decodeTryCpAdminApiResponse(
    actualRegisterDnaResponse
  );
  const dnaHash = Buffer.from(decodedRegisterDnaResponse.data).toString(
    "base64"
  );

  t.equal(decodedRegisterDnaResponse.type, "dna_registered");
  assert("length" in decodedRegisterDnaResponse.data);
  t.equal(decodedRegisterDnaResponse.data.length, 39);
  t.ok(dnaHash.startsWith("hC0k"));

  const actualGenerateAgentPubKeyResponse = await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode({ type: "generate_agent_pub_key" }),
  });
  const decodedGenerateAgentPubKeyResponse = decodeTryCpAdminApiResponse(
    actualGenerateAgentPubKeyResponse
  );
  const agentPubKey = Buffer.from(
    decodedGenerateAgentPubKeyResponse.data
  ).toString("base64");

  t.equal(decodedGenerateAgentPubKeyResponse.type, "agent_pub_key_generated");
  assert("length" in decodedGenerateAgentPubKeyResponse.data);
  t.equal(decodedGenerateAgentPubKeyResponse.data.length, 39);
  t.ok(agentPubKey.startsWith("hCAk"));

  const actualInstallAppResponse = await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode({
      type: "install_app",
      data: {
        installed_app_id: "entry-app",
        agent_key: decodedGenerateAgentPubKeyResponse.data,
        dnas: [{ hash: decodedRegisterDnaResponse.data, role_id: "entry-id" }],
      },
    }),
  });
  const decodedInstallAppResponse = decodeTryCpAdminApiResponse(
    actualInstallAppResponse
  );
  assert("cell_data" in decodedInstallAppResponse.data);
  const cell_id = decodedInstallAppResponse.data.cell_data[0].cell_id;

  t.equal(decodedInstallAppResponse.type, "app_installed");

  const actualEnableApp = await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode({
      type: "enable_app",
      data: {
        installed_app_id: "entry-app",
      },
    }),
  });
  const decodedEnableAppResponse = decodeTryCpAdminApiResponse(actualEnableApp);

  t.equal(decodedEnableAppResponse.type, "app_enabled");

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

  const createEntryResponse = await tryCpClient.call({
    type: "call_app_interface",
    port,
    message: msgpack.encode({
      type: "zome_call",
      data: {
        cap: null,
        cell_id,
        zome_name: "crud",
        fn_name: "create",
        provenance: decodedGenerateAgentPubKeyResponse.data,
        payload: msgpack.encode({ content: "hello" }),
      },
    }),
  });
  const decodedCreateEntryResponse = decodeAppApiResponse(
    createEntryResponse
  ) as CallZomeResponse;
  const decodedPayload = msgpack.decode(
    decodedCreateEntryResponse.data
  ) as Uint8Array;
  const entryHash = Buffer.from(decodedPayload).toString("base64");

  t.equal(decodedPayload.length, 39);
  t.ok(entryHash.startsWith("hCkk"));

  await tryCpClient.call({
    type: "shutdown",
    id: playerId,
  });

  await tryCpClient.close();
  await localTryCpServer.stop();
});
