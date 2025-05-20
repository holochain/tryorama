import {
  ActionHash,
  AppBundle,
  AppBundleSource,
  AppSignal,
  CellProvisioningStrategy,
  CloneIdHelper,
  Duration,
  EntryHash,
  fakeAgentPubKey,
  ProvisionedCell,
  RevokeAgentKeyResponse,
  Signal,
  SignalCb,
} from "@holochain/client";
import { decode, encode } from "@msgpack/msgpack";
import fs from "fs";
import yaml from "js-yaml";
import { readFileSync, realpathSync } from "node:fs";
import { URL } from "node:url";
import { assert, test, expect } from "vitest";
import zlib from "zlib";
import {
  cleanAllConductors,
  CONDUCTOR_CONFIG,
  createConductor,
  dhtSync,
  enableAndGetAgentApp,
  getZomeCaller,
  PlayerApp,
  runLocalServices,
  stopLocalServices,
} from "../src";
import { FIXTURE_DNA_URL, FIXTURE_HAPP_URL } from "./fixture";

const ROLE_NAME = "test";

test("Conductor with custom bootstrap server", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const bootstrapUrl = new URL("https://test.bootstrap.com");
  const conductor = await createConductor(signalingServerUrl, {
    bootstrapServerUrl: bootstrapUrl,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(`${tmpDirPath}/${CONDUCTOR_CONFIG}`, {
    encoding: "utf-8",
  });
  assert.ok(conductorConfig.includes(`bootstrap_url: ${bootstrapUrl.href}`));

  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Conductor with custom signaling server", async () => {
  const signalingServerUrl = new URL("ws://some-signal.server:1234");
  const conductor = await createConductor(signalingServerUrl, {
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(`${tmpDirPath}/${CONDUCTOR_CONFIG}`, {
    encoding: "utf-8",
  });
  assert.ok(conductorConfig.includes(`signal_url: ${signalingServerUrl.href}`));

  await cleanAllConductors();
});

test("Conductor with custom network config", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const initiateIntervalMs = 10_000;
  const minInitiateIntervalMs = 20_000;
  const conductor = await createConductor(signalingServerUrl, {
    initiateIntervalMs,
    minInitiateIntervalMs,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = yaml.load(
    readFileSync(`${tmpDirPath}/${CONDUCTOR_CONFIG}`, { encoding: "utf-8" }),
  );
  assert.ok(
    conductorConfig &&
      typeof conductorConfig === "object" &&
      "network" in conductorConfig,
  );
  const { network } = conductorConfig;
  assert.ok(network && typeof network === "object" && "advanced" in network);
  const { advanced } = network;
  assert.ok(advanced && typeof advanced === "object" && "k2Gossip" in advanced);
  const { k2Gossip } = advanced;
  assert.ok(
    k2Gossip &&
      typeof k2Gossip === "object" &&
      "initiateIntervalMs" in k2Gossip &&
      "minInitiateIntervalMs" in k2Gossip,
  );
  assert.strictEqual(k2Gossip.initiateIntervalMs, initiateIntervalMs);
  assert.strictEqual(k2Gossip.minInitiateIntervalMs, minInitiateIntervalMs);

  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Spawn a conductor and check for admin ws", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  assert.ok(conductor.adminWs());

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Revoke agent key", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);

  // Alice can create an entry before revoking agent key.
  const entryContent = "test-content";
  const createEntryResponse: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  assert.ok(createEntryResponse, "created entry successfully");

  const response: RevokeAgentKeyResponse = await conductor
    .adminWs()
    .revokeAgentKey({ app_id: alice.appId, agent_key: alice.agentPubKey });
  assert.deepEqual(response, [], "revoked key on all cells");

  // After revoking her key, Alice should no longer be able to create an entry.
  await expect(
    alice.cells[0].callZome({
      zome_name: "coordinator",
      fn_name: "create",
      payload: entryContent,
    }),
  ).rejects.toThrow();

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Get app info with app ws", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  });
  await conductor
    .adminWs()
    .enableApp({ installed_app_id: app.installed_app_id });
  const port = await conductor.attachAppInterface();
  const issued = await conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: app.installed_app_id });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const appInfo = await appWs.appInfo();
  assert.ok(appInfo);
  assert.deepEqual(appInfo.status, { type: "running" });
  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Get app info with app agent ws", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  });
  await conductor
    .adminWs()
    .enableApp({ installed_app_id: app.installed_app_id });
  const port = await conductor.attachAppInterface();
  const issued = await conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: app.installed_app_id });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const appInfo = await appWs.appInfo();
  assert.deepEqual(appInfo.status, { type: "running" });
  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Install app with deferred memproofs", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);

  const zippedDnaBundle = fs.readFileSync(realpathSync(FIXTURE_DNA_URL));

  const appBundle: AppBundle = {
    manifest: {
      manifest_version: "1",
      name: "app",
      roles: [
        {
          name: ROLE_NAME,
          provisioning: {
            strategy: CellProvisioningStrategy.Create,
            deferred: false,
          },
          dna: {
            bundled: "dna_1",
            modifiers: { network_seed: "Some_seed" },
          },
        },
      ],
      membrane_proofs_deferred: true,
    },
    resources: {
      dna_1: zippedDnaBundle,
    },
  };

  const zippedAppBundle = zlib.gzipSync(encode(appBundle));

  const app = await conductor.installApp({
    type: "bytes",
    value: zippedAppBundle,
  });

  const port = await conductor.attachAppInterface();
  const issued = await conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: app.installed_app_id });
  const appWs = await conductor.connectAppWs(issued.token, port);

  let appInfo = await appWs.appInfo();
  assert.deepEqual(
    appInfo.status,
    { type: "disabled", value: { reason: { type: "never_started" } } },
    "app status is never_started",
  );

  const response = await appWs.provideMemproofs({});
  assert.equal(response, undefined, "providing memproofs successful");

  await conductor
    .adminWs()
    .enableApp({ installed_app_id: app.installed_app_id });

  appInfo = await appWs.appInfo();
  assert.deepEqual(
    appInfo.status,
    { type: "running" },
    "app status is running",
  );

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Install app with roles settings", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);

  const originTime = Date.now();
  const quantumTime: Duration = {
    secs: originTime,
    nanos: 0,
  };

  const progenitorKey = Uint8Array.from(await fakeAgentPubKey());

  const app = await conductor.installApp(
    {
      type: "path",
      value: FIXTURE_HAPP_URL.pathname,
    },
    {
      rolesSettings: {
        [ROLE_NAME]: {
          type: "provisioned",
          value: {
            membrane_proof: new Uint8Array(6),
            modifiers: {
              network_seed: "hello",
              properties: yaml.dump({ progenitor: progenitorKey }),
            },
          },
        },
      },
    },
  );

  const port = await conductor.attachAppInterface();
  const issued = await conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: app.installed_app_id });
  const appWs = await conductor.connectAppWs(issued.token, port);

  const appInfo = await appWs.appInfo();
  const provisionedCell = appInfo.cell_info[ROLE_NAME][0]
    .value as ProvisionedCell;
  assert.equal(
    provisionedCell.dna_modifiers.network_seed,
    "hello",
    "unexpected network seed",
  );
  assert.deepEqual(
    yaml.load(decode(provisionedCell.dna_modifiers.properties) as string),
    { progenitor: progenitorKey },
    "unexpected dna modifiers",
  );

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Install and call an app", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);
  assert.ok(app.installed_app_id);

  const entryContent = "Bye bye, world";
  const createEntryResponse: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  assert.ok(createEntryResponse);
  const readEntryResponse: typeof entryContent = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryResponse,
  });
  assert.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Get a convenience function for zome calls", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);

  const coordinatorZomeCall = getZomeCaller(alice.cells[0], "coordinator");
  assert.equal(
    typeof coordinatorZomeCall,
    "function",
    "getZomeCaller returns a function",
  );

  const entryHeaderHash: ActionHash = await coordinatorZomeCall(
    "create",
    "test-entry",
  );
  const entryHeaderHashB64 = Buffer.from(entryHeaderHash).toString("base64");
  assert.equal(entryHeaderHash.length, 39, "ActionHash is 39 bytes long");
  assert.ok(
    entryHeaderHashB64.startsWith("hCkk"),
    "ActionHash starts with hCkk",
  );

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Install multiple agents and apps and get access to agents and cells", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const [aliceApp, bobApp] = await conductor.installAgentsApps({
    agentsApps: [
      { app: { type: "path", value: FIXTURE_HAPP_URL.pathname } },
      { app: { type: "path", value: FIXTURE_HAPP_URL.pathname } },
    ],
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issuedAlice = await adminWs.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  const issuedBob = await adminWs.issueAppAuthenticationToken({
    installed_app_id: bobApp.installed_app_id,
  });
  const appWsAlice = await conductor.connectAppWs(issuedAlice.token, port);
  const appWsBob = await conductor.connectAppWs(issuedBob.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWsAlice, aliceApp);
  const bob = await enableAndGetAgentApp(adminWs, appWsBob, bobApp);

  alice.cells.forEach((cell) =>
    assert.deepEqual(cell.cell_id[1], alice.agentPubKey),
  );
  bob.cells.forEach((cell) =>
    assert.deepEqual(cell.cell_id[1], bob.agentPubKey),
  );

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Get a named cell by role name", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);
  assert.ok(alice.namedCells.get(ROLE_NAME), "dna role name matches");

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Zome call can time out before completion", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);
  const cell = alice.namedCells.get(ROLE_NAME);
  assert.ok(cell);

  await expect(
    cell.callZome(
      { zome_name: "coordinator", fn_name: "create", payload: "test" },
      1,
    ),
  ).rejects.toThrow();

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Create and read an entry using the entry zome", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  assert.equal(agentPubKey.length, 39);
  assert.ok(agentPubKeyB64.startsWith("hCAk"));

  const installed_app_id = "entry-app";
  const app = await conductor.installApp(
    { type: "path", value: FIXTURE_HAPP_URL.pathname },
    {
      installedAppId: installed_app_id,
      agentPubKey,
    },
  );
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);
  const { cell_id } = alice.cells[0];
  assert.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  assert.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await appWs.callZome({
    cell_id,
    zome_name: "coordinator",
    fn_name: "create",
    provenance: agentPubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  assert.equal(createEntryHash.length, 39);
  assert.ok(createdEntryHashB64.startsWith("hCkk"));

  const readEntryResponse: typeof entryContent = await appWs.callZome({
    cell_id,
    zome_name: "coordinator",
    fn_name: "read",
    provenance: agentPubKey,
    payload: createEntryHash,
  });
  assert.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Clone cell management", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const appId = "entry-app";
  const app = await conductor.installApp(
    { type: "path", value: FIXTURE_HAPP_URL.pathname },
    {
      installedAppId: appId,
      agentPubKey,
    },
  );
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);

  const cloneCell = await appWs.createCloneCell({
    role_name: ROLE_NAME,
    modifiers: { network_seed: "test-seed" },
  });
  assert.deepEqual(
    cloneCell.clone_id,
    new CloneIdHelper(ROLE_NAME, 0).toString(),
    "clone id is 'role_name.0'",
  );
  assert.deepEqual(
    cloneCell.cell_id[1],
    alice.cells[0].cell_id[1],
    "agent pub key in clone cell and base cell match",
  );

  const testContent = "test-content";
  const entryActionHash: ActionHash = await appWs.callZome({
    cell_id: cloneCell.cell_id,
    zome_name: "coordinator",
    fn_name: "create",
    payload: testContent,
    provenance: agentPubKey,
  });

  await appWs.disableCloneCell({
    clone_cell_id: { type: "clone_id", value: cloneCell.clone_id },
  });
  await expect(
    appWs.callZome({
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      provenance: agentPubKey,
    }),
    "disabled clone cell cannot be called",
  ).rejects.toThrow();

  const enabledCloneCell = await appWs.enableCloneCell({
    clone_cell_id: { type: "clone_id", value: cloneCell.clone_id },
  });
  assert.deepEqual(
    enabledCloneCell,
    cloneCell,
    "enabled clone cell matches created clone cell",
  );
  const readEntryResponse: typeof testContent = await appWs.callZome(
    {
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      provenance: agentPubKey,
    },
    40000,
  );
  assert.equal(
    readEntryResponse,
    testContent,
    "enabled clone cell can be called",
  );

  await appWs.disableCloneCell({
    clone_cell_id: { type: "dna_hash", value: cloneCell.cell_id[0] },
  });
  await conductor.adminWs().deleteCloneCell({
    app_id: appId,
    clone_cell_id: { type: "dna_hash", value: cloneCell.cell_id[0] },
  });
  await expect(
    appWs.enableCloneCell({
      clone_cell_id: { type: "clone_id", value: cloneCell.clone_id },
    }),
    "deleted clone cell cannot be enabled",
  ).rejects.toThrow();

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("2 agent apps test", async () => {
  const { servicesProcess, bootstrapServerUrl, signalingServerUrl } =
    await runLocalServices();
  const app: AppBundleSource = {
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  };

  const conductor1 = await createConductor(signalingServerUrl, {
    bootstrapServerUrl,
  });
  const conductor2 = await createConductor(signalingServerUrl, {
    bootstrapServerUrl,
  });

  const aliceApp = await conductor1.installApp(app);
  const bobApp = await conductor2.installApp(app);
  const adminWs1 = conductor1.adminWs();
  const adminWs2 = conductor2.adminWs();
  const port1 = await conductor1.attachAppInterface();
  const port2 = await conductor2.attachAppInterface();
  const issued1 = await adminWs1.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  const issued2 = await adminWs2.issueAppAuthenticationToken({
    installed_app_id: bobApp.installed_app_id,
  });
  const appWs1 = await conductor1.connectAppWs(issued1.token, port1);
  const appWs2 = await conductor2.connectAppWs(issued2.token, port2);
  const aliceAgentApp = await enableAndGetAgentApp(adminWs1, appWs1, aliceApp);
  const bobAgentApp = await enableAndGetAgentApp(adminWs2, appWs2, bobApp);
  const alice: PlayerApp = {
    conductor: conductor1,
    appWs: appWs1,
    ...aliceAgentApp,
  };
  const bob: PlayerApp = {
    conductor: conductor2,
    appWs: appWs2,
    ...bobAgentApp,
  };

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });

  await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

  const readEntryResponse: typeof entryContent = await bob.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  assert.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor2.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Create and read an entry, 2 conductors, 2 cells, 2 agents", async () => {
  const { servicesProcess, bootstrapServerUrl, signalingServerUrl } =
    await runLocalServices();
  const app: AppBundleSource = {
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  };

  const conductor1 = await createConductor(signalingServerUrl, {
    bootstrapServerUrl,
  });
  const adminWs1 = conductor1.adminWs();
  const aliceApp = await conductor1.installApp(app);
  const port1 = await conductor1.attachAppInterface();
  const issued1 = await adminWs1.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  const appWs1 = await conductor1.connectAppWs(issued1.token, port1);
  const aliceAgentApp = await enableAndGetAgentApp(adminWs1, appWs1, aliceApp);
  const alice: PlayerApp = {
    conductor: conductor1,
    appWs: appWs1,
    ...aliceAgentApp,
  };

  const conductor2 = await createConductor(signalingServerUrl, {
    bootstrapServerUrl,
  });
  const adminWs2 = conductor2.adminWs();
  const bobApp = await conductor2.installApp(app);
  const port2 = await conductor2.attachAppInterface();
  const issued2 = await adminWs2.issueAppAuthenticationToken({
    installed_app_id: bobApp.installed_app_id,
  });
  const appWs2 = await conductor2.connectAppWs(issued2.token, port2);
  const bobAgentApp = await enableAndGetAgentApp(adminWs2, appWs2, bobApp);
  const bob: PlayerApp = {
    conductor: conductor2,
    appWs: appWs2,
    ...bobAgentApp,
  };

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  assert.equal(createEntryHash.length, 39);
  assert.ok(createdEntryHashB64.startsWith("hCkk"));

  await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

  const readEntryResponse: typeof entryContent = await bob.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  assert.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor2.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Receive a signal", async () => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  let signalHandler: SignalCb | undefined;
  const signalReceived = new Promise<AppSignal>((resolve) => {
    signalHandler = (signal: Signal) => {
      assert.ok(signal.type === "app");
      resolve(signal.value);
    };
  });
  const conductor = await createConductor(signalingServerUrl);

  const aliceApp = await conductor.installApp({
    type: "path",
    value: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, aliceApp);

  assert.ok(signalHandler);
  appWs.on("signal", signalHandler);
  const aliceSignal = { value: "signal" };
  await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    payload: aliceSignal,
  });
  const actualSignal = await signalReceived;
  assert.deepEqual(actualSignal.payload, aliceSignal);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});
