import {
  ActionHash,
  AppBundleSource,
  AppSignal,
  CellProvisioningStrategy,
  CellType,
  CloneId,
  Duration,
  EntryHash,
  fakeAgentPubKey,
  ProvisionedCell,
  RevokeAgentKeyResponse,
  Signal,
  SignalCb,
} from "@holochain/client";
import assert from "node:assert";
import { readFileSync, realpathSync } from "node:fs";
import { URL } from "node:url";
import test from "tape-promise/tape.js";
import {
  NetworkType,
  Player,
  cleanAllConductors,
  createConductor,
  dhtSync,
  enableAndGetAgentApp,
  getZomeCaller,
  runLocalServices,
  stopLocalServices,
} from "../../src";
import { FIXTURE_DNA_URL, FIXTURE_HAPP_URL } from "../fixture";
import { decode } from "@msgpack/msgpack";
import yaml from "js-yaml";

const ROLE_NAME = "test";

test("Local Conductor - spawn a conductor with WebRTC network", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl, {
    networkType: NetworkType.WebRtc,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("- type: webrtc"));
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor with mem network", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl, {
    networkType: NetworkType.Mem,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("transport_pool:\n  - type: mem"));

  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor with a bootstrap service", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const bootstrapUrl = new URL("https://test.bootstrap.com");
  const conductor = await createConductor(signalingServerUrl, {
    bootstrapServerUrl: bootstrapUrl,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes(`bootstrap_service: ${bootstrapUrl.href}`));

  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor and check for admin ws", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  t.ok(conductor.adminWs());

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

// unstable-dpki
//   test("Local Conductor - default conductor has DPKI enabled", async (t) => {
//     const { servicesProcess, signalingServerUrl } = await runLocalServices();
//     const conductor = await createConductor(signalingServerUrl);
//     const tmpDirPath = conductor.getTmpDirectory();
//     const conductorConfig = readFileSync(
//       tmpDirPath + "/conductor-config.yaml"
//     ).toString();
//     t.assert(
//       conductorConfig.includes("no_dpki: false"),
//       "DPKI enabled in conductor config"
//     );

//     await conductor.shutDown();
//     await stopLocalServices(servicesProcess);
//     await cleanAllConductors();
//   });

// test("Local Conductor - spawn a conductor without DPKI enabled", async (t) => {
//   const { servicesProcess, signalingServerUrl } = await runLocalServices();
//   const conductor = await createConductor(signalingServerUrl, { noDpki: true });
//   const tmpDirPath = conductor.getTmpDirectory();
//   const conductorConfig = readFileSync(
//     tmpDirPath + "/conductor-config.yaml"
//   ).toString();
//   t.assert(
//     conductorConfig.includes("no_dpki: true"),
//     "DPKI disabled in conductor config"
//   );

//   await conductor.shutDown();
//   await stopLocalServices(servicesProcess);
//   await cleanAllConductors();
// });

// test("Local Conductor - default conductor has test DPKI network seed", async (t) => {
//   const { servicesProcess, signalingServerUrl } = await runLocalServices();
//   const conductor = await createConductor(signalingServerUrl);
//   const tmpDirPath = conductor.getTmpDirectory();
//   const conductorConfig = readFileSync(
//     tmpDirPath + "/conductor-config.yaml"
//   ).toString();
//   t.assert(
//     conductorConfig.includes("network_seed: deepkey-test"),
//     "default DPKI network seed set in conductor config"
//   );

//   await conductor.shutDown();
//   await stopLocalServices(servicesProcess);
//   await cleanAllConductors();
// });

// test("Local Conductor - set a DPKI network seed", async (t) => {
//   const { servicesProcess, signalingServerUrl } = await runLocalServices();
//   const networkSeed = "tryorama-test-dpki";
//   const conductor = await createConductor(signalingServerUrl, {
//     dpkiNetworkSeed: networkSeed,
//   });
//   const tmpDirPath = conductor.getTmpDirectory();
//   const conductorConfig = readFileSync(
//     tmpDirPath + "/conductor-config.yaml"
//   ).toString();
//   t.assert(
//     conductorConfig.includes(`network_seed: ${networkSeed}`),
//     "DPKI network seed set in conductor config"
//   );

//   await conductor.shutDown();
//   await stopLocalServices(servicesProcess);
//   await cleanAllConductors();
// });

test("Local Conductor - revoke agent key", async (t) => {
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
  t.ok(createEntryResponse, "created entry successfully");

  const response: RevokeAgentKeyResponse = await conductor
    .adminWs()
    .revokeAgentKey({ app_id: alice.appId, agent_key: alice.agentPubKey });
  t.deepEqual(response, [], "revoked key on all cells");

  // After revoking her key, Alice should no longer be able to create an entry.
  await t.rejects(
    alice.cells[0].callZome({
      zome_name: "coordinator",
      fn_name: "create",
      payload: entryContent,
    })
  );

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - get app info with app ws", async (t) => {
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
  assert(appInfo);
  t.deepEqual(appInfo.status, { type: "running" });
  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - get app info with app agent ws", async (t) => {
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
  t.deepEqual(appInfo.status, { type: "running" });
  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - install app with deferred memproofs", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);

  const app = await conductor.installApp({
    type: "bundle",
    value: {
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
              path: realpathSync(FIXTURE_DNA_URL),
              modifiers: { network_seed: "some_seed" },
            },
          },
        ],
        membrane_proofs_deferred: true,
      },
      resources: {},
    },
  });

  const port = await conductor.attachAppInterface();
  const issued = await conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: app.installed_app_id });
  const appWs = await conductor.connectAppWs(issued.token, port);

  let appInfo = await appWs.appInfo();
  t.deepEqual(
    appInfo.status,
    { type: "disabled", value: { reason: { type: "never_started" } } },
    "app status is never_started"
  );

  const response = await appWs.provideMemproofs({});
  t.equal(response, undefined, "providing memproofs successful");

  await conductor
    .adminWs()
    .enableApp({ installed_app_id: app.installed_app_id });

  appInfo = await appWs.appInfo();
  t.deepEqual(appInfo.status, { type: "running" }, "app status is running");

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - install app with roles settings", async (t) => {
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
      type: "bundle",
      value: {
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
                path: realpathSync(FIXTURE_DNA_URL),
                modifiers: { network_seed: "some_seed" },
              },
            },
          ],
          membrane_proofs_deferred: true,
        },
        resources: {},
      },
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
              origin_time: originTime,
              quantum_time: quantumTime,
            },
          },
        },
      },
    }
  );

  const port = await conductor.attachAppInterface();
  const issued = await conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: app.installed_app_id });
  const appWs = await conductor.connectAppWs(issued.token, port);

  const appInfo = await appWs.appInfo();
  const provisionedCell: ProvisionedCell =
    appInfo.cell_info[ROLE_NAME][0][CellType.Provisioned];
  t.equal(provisionedCell.dna_modifiers.network_seed, "hello");
  t.deepEqual(
    yaml.load(decode(provisionedCell.dna_modifiers.properties) as string),
    { progenitor: progenitorKey }
  );
  t.equal(provisionedCell.dna_modifiers.origin_time, originTime);
  t.deepEqual(provisionedCell.dna_modifiers.quantum_time, quantumTime);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - install and call an app", async (t) => {
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
  t.ok(app.installed_app_id);

  const entryContent = "Bye bye, world";
  const createEntryResponse: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  t.ok(createEntryResponse);
  const readEntryResponse: typeof entryContent = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryResponse,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - get a convenience function for zome calls", async (t) => {
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
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - install multiple agents and apps and get access to agents and cells", async (t) => {
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
    t.deepEqual(cell.cell_id[1], alice.agentPubKey)
  );
  bob.cells.forEach((cell) => t.deepEqual(cell.cell_id[1], bob.agentPubKey));

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - get a named cell by role name", async (t) => {
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
  t.ok(alice.namedCells.get(ROLE_NAME), "dna role name matches");

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - zome call can time out before completion", async (t) => {
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
  assert(cell);

  await t.rejects(
    cell.callZome(
      { zome_name: "coordinator", fn_name: "create", payload: "test" },
      1
    )
  );

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - create and read an entry using the entry zome", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const installed_app_id = "entry-app";
  const app = await conductor.installApp(
    { type: "path", value: FIXTURE_HAPP_URL.pathname },
    {
      installedAppId: installed_app_id,
      agentPubKey,
    }
  );
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);
  const { cell_id } = alice.cells[0];
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await appWs.callZome({
    cell_id,
    zome_name: "coordinator",
    fn_name: "create",
    provenance: agentPubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  const readEntryResponse: typeof entryContent = await appWs.callZome({
    cell_id,
    zome_name: "coordinator",
    fn_name: "read",
    provenance: agentPubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - clone cell management", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const appId = "entry-app";
  const app = await conductor.installApp(
    { type: "path", value: FIXTURE_HAPP_URL.pathname },
    {
      installedAppId: appId,
      agentPubKey,
    }
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
  t.deepEqual(
    cloneCell.clone_id,
    new CloneId(ROLE_NAME, 0).toString(),
    "clone id is 'role_name.0'"
  );
  t.deepEqual(
    cloneCell.cell_id[1],
    alice.cells[0].cell_id[1],
    "agent pub key in clone cell and base cell match"
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
  await t.rejects(
    appWs.callZome({
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      provenance: agentPubKey,
    }),
    "disabled clone cell cannot be called"
  );

  const enabledCloneCell = await appWs.enableCloneCell({
    clone_cell_id: { type: "clone_id", value: cloneCell.clone_id },
  });
  t.deepEqual(
    enabledCloneCell,
    cloneCell,
    "enabled clone cell matches created clone cell"
  );
  const readEntryResponse: typeof testContent = await appWs.callZome(
    {
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      provenance: agentPubKey,
    },
    40000
  );
  t.equal(readEntryResponse, testContent, "enabled clone cell can be called");

  await appWs.disableCloneCell({
    clone_cell_id: { type: "dna_hash", value: cloneCell.cell_id[0] },
  });
  await conductor.adminWs().deleteCloneCell({
    app_id: appId,
    clone_cell_id: { type: "dna_hash", value: cloneCell.cell_id[0] },
  });
  await t.rejects(
    appWs.enableCloneCell({
      clone_cell_id: { type: "clone_id", value: cloneCell.clone_id },
    }),
    "deleted clone cell cannot be enabled"
  );

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - 2 agent apps test", async (t) => {
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
  const alice: Player = {
    conductor: conductor1,
    appWs: appWs1,
    ...aliceAgentApp,
  };
  const bob: Player = {
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
  t.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor2.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - create and read an entry, 2 conductors, 2 cells, 2 agents", async (t) => {
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
  const alice: Player = {
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
  const bob: Player = {
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
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

  const readEntryResponse: typeof entryContent = await bob.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor2.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - Receive a signal", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  let signalHandler: SignalCb | undefined;
  const signalReceived = new Promise<AppSignal>((resolve) => {
    signalHandler = (signal: Signal) => {
      assert(signal.type === "app");
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

  assert(signalHandler);
  appWs.on("signal", signalHandler);
  const aliceSignal = { value: "signal" };
  await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    payload: aliceSignal,
  });
  const actualSignal = await signalReceived;
  t.deepEqual(actualSignal.payload, aliceSignal);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});
