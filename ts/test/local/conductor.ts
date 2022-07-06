import {
  ActionHash,
  AppSignal,
  AppSignalCb,
  DnaSource,
  EntryHash,
} from "@holochain/client";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import test from "tape-promise/tape.js";
import {
  addAllAgentsToAllConductors,
  getZomeCaller,
} from "../../src/common.js";
import {
  cleanAllConductors,
  createConductor,
  NetworkType,
} from "../../src/index.js";
import { pause } from "../../src/util.js";
import { FIXTURE_DNA_URL, FIXTURE_HAPP_URL } from "../fixture/index.js";

test("Local Conductor - Spawn a conductor with QUIC network", async (t) => {
  const conductor = await createConductor({
    networkType: NetworkType.Quic,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("network_type: quic"));

  await cleanAllConductors();
});

test("Local Conductor - Spawn a conductor with mDNS network", async (t) => {
  const conductor = await createConductor({
    networkType: NetworkType.Mdns,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("network_type: quic_mdns"));

  await cleanAllConductors();
});

test("Local Conductor - Spawn a conductor with a bootstrap service", async (t) => {
  const bootstrapUrl = new URL("https://test.bootstrap.com");
  const conductor = await createConductor({
    bootstrapUrl,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("network_type: quic_bootstrap"));
  t.ok(conductorConfig.includes(`bootstrap_service: "${bootstrapUrl.href}"`));

  await cleanAllConductors();
});

test("Local Conductor - Spawn a conductor with a bind_to address", async (t) => {
  const bindTo = new URL("https://0.0.0.0:100");
  const conductor = await createConductor({
    bindTo,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("network_type: quic"));
  t.ok(conductorConfig.includes(`bind_to: "${bindTo.href}"`));

  await cleanAllConductors();
});

test("Local Conductor - Spawn a conductor with an overridden host address", async (t) => {
  const hostOverride = new URL("https://1.2.3.4");
  const conductor = await createConductor({
    hostOverride,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("network_type: quic"));
  t.ok(conductorConfig.includes(`override_host: "${hostOverride.href}"`));

  await cleanAllConductors();
});

test("Local Conductor - Spawn a conductor with an overridden port", async (t) => {
  const portOverride = 10000;
  const conductor = await createConductor({
    portOverride,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("network_type: quic"));
  t.ok(conductorConfig.includes(`override_port: ${portOverride}`));

  await cleanAllConductors();
});

test("Local Conductor - Spawn a conductor with all available config arguments", async (t) => {
  const bootstrapUrl = new URL("https://test.bootstrap.com");
  const bindTo = new URL("https://0.0.0.0:100");
  const hostOverride = new URL("https://1.2.3.4");
  const portOverride = 10000;
  const conductor = await createConductor({
    bootstrapUrl,
    bindTo,
    hostOverride,
    portOverride,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("network_type: quic"));
  t.ok(conductorConfig.includes(`bootstrap_service: "${bootstrapUrl.href}"`));
  t.ok(conductorConfig.includes(`bind_to: "${bindTo.href}"`));
  t.ok(conductorConfig.includes(`override_host: "${hostOverride.href}"`));
  t.ok(conductorConfig.includes(`override_port: ${portOverride}`));

  await cleanAllConductors();
});

test("Local Conductor - Spawn a conductor with a proxy service", async (t) => {
  const proxy = new URL("https://0.0.0.0:100");
  const conductor = await createConductor({
    proxy,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("network_type: quic_bootstrap"));
  t.ok(conductorConfig.includes("- type: proxy"));
  t.ok(conductorConfig.includes(`proxy_url: "${proxy.href}"`));

  await cleanAllConductors();
});

test("Local Conductor - Spawn a conductor and check for admin and app ws", async (t) => {
  const conductor = await createConductor();
  t.ok(conductor.adminWs());
  t.ok(conductor.appWs());

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Get app info", async (t) => {
  const conductor = await createConductor();
  const [aliceHapps] = await conductor.installAgentsHapps({
    agentsDnas: [[{ path: FIXTURE_DNA_URL.pathname }]],
  });
  const appInfo = await conductor.appWs().appInfo({
    installed_app_id: aliceHapps.happId,
  });
  t.deepEqual(appInfo.status, { running: null });
  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Install and call a hApp bundle", async (t) => {
  const conductor = await createConductor();
  const installedHappBundle = await conductor.installHappBundle({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(installedHappBundle.happId);

  const entryContent = "Bye bye, world";
  const createEntryResponse: EntryHash =
    await installedHappBundle.cells[0].callZome({
      zome_name: "crud",
      fn_name: "create",
      payload: entryContent,
    });
  t.ok(createEntryResponse);
  const readEntryResponse: typeof entryContent =
    await installedHappBundle.cells[0].callZome({
      zome_name: "crud",
      fn_name: "read",
      payload: createEntryResponse,
    });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Get a convenience function for zome calls", async (t) => {
  const conductor = await createConductor();
  const [aliceHapps] = await conductor.installAgentsHapps({
    agentsDnas: [[{ path: FIXTURE_DNA_URL.pathname }]],
  });
  const crudZomeCall = getZomeCaller(aliceHapps.cells[0], "crud");
  t.equal(typeof crudZomeCall, "function", "getZomeCaller returns a function");

  const entryHeaderHash: ActionHash = await crudZomeCall(
    "create",
    "test-entry"
  );
  const entryHeaderHashB64 = Buffer.from(entryHeaderHash).toString("base64");
  t.equal(entryHeaderHash.length, 39, "ActionHash is 39 bytes long");
  t.ok(entryHeaderHashB64.startsWith("hCkk"), "ActionHash starts with hCkk");

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Install multiple agents and DNAs and get access to agents and cells", async (t) => {
  const conductor = await createConductor();
  const [aliceHapps, bobHapps] = await conductor.installAgentsHapps({
    agentsDnas: [
      [{ path: FIXTURE_DNA_URL.pathname }, { path: FIXTURE_DNA_URL.pathname }],
      [{ path: FIXTURE_DNA_URL.pathname }, { path: FIXTURE_DNA_URL.pathname }],
    ],
  });
  aliceHapps.cells.forEach((cell) =>
    t.deepEqual(cell.cell_id[1], aliceHapps.agentPubKey)
  );
  bobHapps.cells.forEach((cell) =>
    t.deepEqual(cell.cell_id[1], bobHapps.agentPubKey)
  );

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Install hApp bundle and access cells with role ids", async (t) => {
  const conductor = await createConductor();
  const aliceHapp = await conductor.installHappBundle({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(aliceHapp.namedCells.get("test"));

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Zome call can time out before completion", async (t) => {
  const conductor = await createConductor();
  const aliceHapp = await conductor.installHappBundle({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const cell = aliceHapp.namedCells.get("test");
  assert(cell);

  await t.rejects(cell.callZome({ fn_name: "create", zome_name: "crud" }, 1));

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Create and read an entry using the entry zome", async (t) => {
  const conductor = await createConductor();

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const appId = "entry-app";
  const dnaHash = await conductor.adminWs().registerDna({
    path: FIXTURE_DNA_URL.pathname,
  });
  const installedAppInfo = await conductor.adminWs().installApp({
    installed_app_id: appId,
    agent_key: agentPubKey,
    dnas: [{ hash: dnaHash, role_id: "entry-dna" }],
  });
  const { cell_id } = installedAppInfo.cell_data[0];
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse = await conductor.adminWs().enableApp({
    installed_app_id: appId,
  });
  t.deepEqual(enabledAppResponse.app.status, { running: null });

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await conductor.appWs().callZome({
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "create",
    provenance: agentPubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  const readEntryResponse: typeof entryContent = await conductor
    .appWs()
    .callZome({
      cap_secret: null,
      cell_id,
      zome_name: "crud",
      fn_name: "read",
      provenance: agentPubKey,
      payload: createEntryHash,
    });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const dnas: DnaSource[] = [{ path: FIXTURE_DNA_URL.pathname }];

  const conductor1 = await createConductor();
  const conductor2 = await createConductor();
  const [aliceHapps, bobHapps] = await conductor1.installAgentsHapps({
    agentsDnas: [dnas, dnas],
  });

  await addAllAgentsToAllConductors([conductor1, conductor2]);

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await aliceHapps.cells[0].callZome({
    zome_name: "crud",
    fn_name: "create",
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  await pause(100);

  const readEntryResponse: typeof entryContent =
    await bobHapps.cells[0].callZome({
      zome_name: "crud",
      fn_name: "read",
      payload: createEntryHash,
    });
  t.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor2.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Receive a signal", async (t) => {
  const dnas: DnaSource[] = [{ path: FIXTURE_DNA_URL.pathname }];

  let signalHandler: AppSignalCb | undefined;
  const signalReceived = new Promise<AppSignal>((resolve) => {
    signalHandler = (signal) => {
      resolve(signal);
    };
  });
  const conductor = await createConductor({ signalHandler, timeout: 30000 });

  const [aliceHapps] = await conductor.installAgentsHapps({
    agentsDnas: [dnas],
  });

  const aliceSignal = { value: "signal" };
  aliceHapps.cells[0].callZome({
    zome_name: "crud",
    fn_name: "signal_loopback",
    payload: aliceSignal,
  });
  const actualSignal = await signalReceived;
  t.deepEqual(actualSignal.data.payload, aliceSignal);

  await conductor.shutDown();
  await cleanAllConductors();
});
