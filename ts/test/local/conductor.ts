import {
  ActionHash,
  AppBundleSource,
  AppSignal,
  AppSignalCb,
  CloneId,
  authorizeSigningCredentials,
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
import { FIXTURE_HAPP_URL } from "../fixture/index.js";

const ROLE_NAME = "test";

test("Local Conductor - spawn a conductor with QUIC network", async (t) => {
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

test("Local Conductor - spawn a conductor with mDNS network", async (t) => {
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

test("Local Conductor - spawn a conductor with a bootstrap service", async (t) => {
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
  t.ok(conductorConfig.includes(`bootstrap_service: ${bootstrapUrl.href}`));

  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor with a bind_to address", async (t) => {
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
  t.ok(conductorConfig.includes(`bind_to: ${bindTo.href}`));

  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor with an overridden host address", async (t) => {
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
  t.ok(conductorConfig.includes(`override_host: ${hostOverride.href}`));

  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor with an overridden port", async (t) => {
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

test("Local Conductor - spawn a conductor with all available config arguments", async (t) => {
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
  t.ok(conductorConfig.includes(`bootstrap_service: ${bootstrapUrl.href}`));
  t.ok(conductorConfig.includes(`bind_to: ${bindTo.href}`));
  t.ok(conductorConfig.includes(`override_host: ${hostOverride.href}`));
  t.ok(conductorConfig.includes(`override_port: ${portOverride}`));

  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor with a proxy service", async (t) => {
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
  t.ok(conductorConfig.includes(`proxy_url: ${proxy.href}`));

  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor and check for admin and app ws", async (t) => {
  const conductor = await createConductor();
  t.ok(conductor.adminWs());
  t.ok(conductor.appWs());

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - get app info", async (t) => {
  const conductor = await createConductor();
  const alice = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const appInfo = await conductor.appWs().appInfo({
    installed_app_id: alice.appId,
  });
  t.deepEqual(appInfo.status, { running: null });
  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - install and call an app", async (t) => {
  const conductor = await createConductor();
  const app = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(app.appId);

  await authorizeSigningCredentials(conductor.adminWs(), app.cells[0].cell_id, [
    ["coordinator", "create"],
    ["coordinator", "read"],
  ]);

  const entryContent = "Bye bye, world";
  const createEntryResponse: EntryHash = await app.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  t.ok(createEntryResponse);
  const readEntryResponse: typeof entryContent = await app.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryResponse,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - get a convenience function for zome calls", async (t) => {
  const conductor = await createConductor();
  const [alice] = await conductor.installAgentsApps({
    agentsApps: [{ app: { path: FIXTURE_HAPP_URL.pathname } }],
  });
  await alice.authorizeSigningCredentials(alice.cells[0].cell_id, [
    ["coordinator", "create"],
  ]);

  const coordinatorZomeCall = getZomeCaller(alice.cells[0], "coordinator");
  t.equal(
    typeof coordinatorZomeCall,
    "function",
    "getZomeCaller returns a function"
  );

  const entryHeaderHash: ActionHash = await coordinatorZomeCall(
    "create",
    "test-entry"
  );
  const entryHeaderHashB64 = Buffer.from(entryHeaderHash).toString("base64");
  t.equal(entryHeaderHash.length, 39, "ActionHash is 39 bytes long");
  t.ok(entryHeaderHashB64.startsWith("hCkk"), "ActionHash starts with hCkk");

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - install multiple agents and apps and get access to agents and cells", async (t) => {
  const conductor = await createConductor();
  const [alice, bob] = await conductor.installAgentsApps({
    agentsApps: [
      { app: { path: FIXTURE_HAPP_URL.pathname } },
      { app: { path: FIXTURE_HAPP_URL.pathname } },
    ],
  });
  alice.cells.forEach((cell) =>
    t.deepEqual(cell.cell_id[1], alice.agentPubKey)
  );
  bob.cells.forEach((cell) => t.deepEqual(cell.cell_id[1], bob.agentPubKey));

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - get a named cell by role name", async (t) => {
  const conductor = await createConductor();
  const alice = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(alice.namedCells.get(ROLE_NAME), "dna role name matches");

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - zome call can time out before completion", async (t) => {
  const conductor = await createConductor();
  const alice = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const cell = alice.namedCells.get(ROLE_NAME);
  assert(cell);
  const zome_name = "coordinator";
  const fn_name = "create";
  await alice.authorizeSigningCredentials(cell.cell_id, [[zome_name, fn_name]]);

  await t.rejects(cell.callZome({ zome_name, fn_name }, 1));

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - create and read an entry using the entry zome", async (t) => {
  const conductor = await createConductor();

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const installed_app_id = "entry-app";
  const alice = await conductor.installApp(
    { path: FIXTURE_HAPP_URL.pathname },
    {
      installedAppId: installed_app_id,
      agentPubKey,
    }
  );
  const { cell_id } = alice.cells[0];
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  await alice.authorizeSigningCredentials(alice.cells[0].cell_id, [
    ["coordinator", "create"],
    ["coordinator", "read"],
  ]);

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await conductor.appWs().callZome({
    cap_secret: null,
    cell_id,
    zome_name: "coordinator",
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
      zome_name: "coordinator",
      fn_name: "read",
      provenance: agentPubKey,
      payload: createEntryHash,
    });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - clone cell management", async (t) => {
  const conductor = await createConductor();
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const appId = "entry-app";
  const alice = await conductor.installApp(
    { path: FIXTURE_HAPP_URL.pathname },
    {
      installedAppId: appId,
      agentPubKey,
    }
  );

  await alice.authorizeSigningCredentials(alice.cells[0].cell_id, [
    ["coordinator", "create"],
    ["coordinator", "read"],
  ]);

  const cloneCell = await conductor.appWs().createCloneCell({
    app_id: appId,
    role_name: ROLE_NAME,
    modifiers: { network_seed: "test-seed" },
  });
  t.deepEqual(
    cloneCell.role_name,
    new CloneId(ROLE_NAME, 0).toString(),
    "clone id is 'role_name.0'"
  );
  t.deepEqual(
    cloneCell.cell_id[1],
    alice.cells[0].cell_id[1],
    "agent pub key in clone cell and base cell match"
  );

  await alice.authorizeSigningCredentials(cloneCell.cell_id, [
    ["coordinator", "create"],
    ["coordinator", "read"],
  ]);

  const testContent = "test-content";
  const entryActionHash: ActionHash = await conductor.appWs().callZome({
    cell_id: cloneCell.cell_id,
    zome_name: "coordinator",
    fn_name: "create",
    payload: testContent,
    cap_secret: null,
    provenance: agentPubKey,
  });

  await conductor
    .appWs()
    .disableCloneCell({ app_id: appId, clone_cell_id: cloneCell.cell_id });
  await t.rejects(
    conductor.appWs().callZome({
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      cap_secret: null,
      provenance: agentPubKey,
    }),
    "disabled clone cell cannot be called"
  );

  const enabledCloneCell = await conductor
    .appWs()
    .enableCloneCell({ app_id: appId, clone_cell_id: cloneCell.role_name });
  t.deepEqual(
    enabledCloneCell,
    cloneCell,
    "enabled clone cell matches created clone cell"
  );
  // TODO this currently fails because of a bug in Holochain
  // comment back in once fixed
  //
  // const readEntryResponse: typeof testContent = await conductor
  //   .appWs()
  //   .callZome(
  //     {
  //       cell_id: cloneCell.cell_id,
  //       zome_name: "coordinator",
  //       fn_name: "read",
  //       payload: entryActionHash,
  //       cap_secret: null,
  //       provenance: agentPubKey,
  //     },
  //     40000
  //   );
  // t.equal(readEntryResponse, testContent, "enabled clone cell can be called");

  await conductor
    .appWs()
    .disableCloneCell({ app_id: appId, clone_cell_id: cloneCell.cell_id });
  await conductor
    .adminWs()
    .deleteCloneCell({ app_id: appId, clone_cell_id: cloneCell.cell_id });
  await t.rejects(
    conductor
      .appWs()
      .enableCloneCell({ app_id: appId, clone_cell_id: cloneCell.role_name }),
    "deleted clone cell cannot be enabled"
  );

  await conductor.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const app: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };

  const conductor1 = await createConductor();
  const conductor2 = await createConductor();
  const alice = await conductor1.installApp(app);
  const bob = await conductor2.installApp(app);

  await addAllAgentsToAllConductors([conductor1, conductor2]);

  await alice.authorizeSigningCredentials(alice.cells[0].cell_id, [
    ["coordinator", "create"],
  ]);
  await bob.authorizeSigningCredentials(bob.cells[0].cell_id, [
    ["coordinator", "read"],
  ]);

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  await pause(1000);

  const readEntryResponse: typeof entryContent = await bob.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor2.shutDown();
  await cleanAllConductors();
});

test("Local Conductor - Receive a signal", async (t) => {
  let signalHandler: AppSignalCb | undefined;
  const signalReceived = new Promise<AppSignal>((resolve) => {
    signalHandler = (signal) => {
      resolve(signal);
    };
  });
  const conductor = await createConductor();

  const alice = await conductor.installApp({ path: FIXTURE_HAPP_URL.pathname });
  await alice.authorizeSigningCredentials(alice.cells[0].cell_id, [
    ["coordinator", "signal_loopback"],
  ]);

  assert(signalHandler);
  conductor.appWs().on("signal", signalHandler);
  const aliceSignal = { value: "signal" };
  alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    payload: aliceSignal,
  });
  const actualSignal = await signalReceived;
  t.deepEqual(actualSignal.data.payload, aliceSignal);

  await conductor.shutDown();
  await cleanAllConductors();
});
