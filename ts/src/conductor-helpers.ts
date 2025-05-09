import {
  AdminWebsocket,
  AppInfo,
  AppWebsocket,
  CallZomeResponse,
  CellType,
  ClonedCell,
  ProvisionedCell,
  RoleName,
} from "@holochain/client";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { Conductor } from "./conductor.js";
import { makeLogger } from "./logger.js";
import { AgentApp, CallableCell, CellZomeCallRequest } from "./types.js";

const BOOTSTRAP_SERVER_STARTUP_STRING = "#kitsune2_bootstrap_srv#listening#";

/**
 * @internal
 */
export const _ALLOWED_ORIGIN = "tryorama-interface";

/**
 * Spawn bootstrap and signalling server to enable peer discovery and connections between peers.
 *
 * @public
 */
export const runLocalServices = async () => {
  const logger = makeLogger("Local services");
  const servicesProcess = spawn("kitsune2-bootstrap-srv");
  return new Promise<{
    servicesProcess: ChildProcessWithoutNullStreams;
    bootstrapServerUrl: URL;
    signalingServerUrl: URL;
  }>((resolve, reject) => {
    servicesProcess.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        logger.error(
          "No kitsune2-bootstrap-srv binary found in the environment.",
        );
      } else {
        logger.error("Failed to spawn kitsune2-bootstrap-srv: ", err);
      }
      reject("Failed to spawn kitsune2-bootstrap-srv");
    });
    servicesProcess.stdout.on("data", (data: Buffer) => {
      const processData = data.toString();
      logger.debug(processData);
      if (processData.includes(BOOTSTRAP_SERVER_STARTUP_STRING)) {
        const listeningAddress = processData
          .split(BOOTSTRAP_SERVER_STARTUP_STRING)[1]
          .split("#")[0];
        const bootstrapServerUrl = new URL(`http://${listeningAddress}`);
        const signalingServerUrl = new URL(`ws://${listeningAddress}`);
        logger.verbose(`bootstrap server url: ${bootstrapServerUrl}`);
        logger.verbose(`signaling server url: ${signalingServerUrl}`);
        resolve({
          servicesProcess,
          bootstrapServerUrl,
          signalingServerUrl,
        });
      }
    });
    servicesProcess.stderr.on("data", (data) => logger.error(data.toString()));
  });
};

/**
 * Shutdown signalling server process.
 *
 * @public
 */
export const stopLocalServices = (
  localServicesProcess: ChildProcessWithoutNullStreams,
) => {
  if (localServicesProcess.pid === undefined) {
    return null;
  }
  return new Promise<number | null>((resolve) => {
    localServicesProcess.on("exit", (code) => {
      localServicesProcess?.removeAllListeners();
      localServicesProcess?.stdout.removeAllListeners();
      localServicesProcess?.stderr.removeAllListeners();
      resolve(code);
    });
    localServicesProcess.kill();
  });
};

/**
 * Add all agents of all conductors to each other. Shortcuts peer discovery
 * through a bootstrap server or gossiping.
 *
 * @param conductors - Conductors to mutually exchange all agents with.
 *
 * @public
 */
export const addAllAgentsToAllConductors = async (conductors: Conductor[]) => {
  await Promise.all(
    conductors.map(async (playerToShareAbout, playerToShareAboutIdx) => {
      const agentInfosToShareAbout = await playerToShareAbout
        .adminWs()
        .agentInfo({
          cell_id: null,
        });
      await Promise.all(
        conductors.map(async (playerToShareWith, playerToShareWithIdx) => {
          if (playerToShareAboutIdx !== playerToShareWithIdx) {
            playerToShareWith.adminWs().addAgentInfo({
              agent_infos: agentInfosToShareAbout,
            });
          }
        }),
      );
    }),
  );
};

function assertZomeResponse<T>(
  response: CallZomeResponse,
): asserts response is T {
  return;
}

/**
 * Enable an app and build an agent app object.
 *
 * @param adminWs - The admin websocket to use for admin requests.
 * @param appWs - The app websocket to use for app requests.
 * @param appInfo - The app info of the app to enable.
 * @returns An app agent object.
 *
 * @public
 */
export const enableAndGetAgentApp = async (
  adminWs: AdminWebsocket,
  appWs: AppWebsocket,
  appInfo: AppInfo,
) => {
  const enableAppResponse = await adminWs.enableApp({
    installed_app_id: appInfo.installed_app_id,
  });
  if (enableAppResponse.errors.length) {
    throw new Error(`failed to enable app: ${enableAppResponse.errors}`);
  }
  const cells: CallableCell[] = [];
  const namedCells = new Map<RoleName, CallableCell>();
  Object.keys(appInfo.cell_info).forEach((role_name) => {
    appInfo.cell_info[role_name].forEach((cellInfo) => {
      if (cellInfo.type === CellType.Provisioned) {
        const callableCell = getCallableCell(appWs, cellInfo.value);
        cells.push(callableCell);
        namedCells.set(role_name, callableCell);
      } else if (cellInfo.type === CellType.Cloned && cellInfo.value.clone_id) {
        const callableCell = getCallableCell(appWs, cellInfo.value);
        cells.push(callableCell);
        namedCells.set(cellInfo.value.clone_id, callableCell);
      } else {
        throw new Error("Stem cells are not implemented");
      }
    });
  });
  const agentApp: AgentApp = {
    appId: appInfo.installed_app_id,
    agentPubKey: appInfo.agent_pub_key,
    cells,
    namedCells,
  };
  return agentApp;
};

/**
 * Create curried version of `callZome` function for a specific cell.
 *
 * @param appWs - App websocket to use for calling zome.
 * @param cell - Cell to bind zome call function to.
 * @returns A callable cell.
 *
 * @public
 */
export const getCallableCell = (
  appWs: AppWebsocket,
  cell: ClonedCell | ProvisionedCell,
) => ({
  ...cell,
  callZome: async <T>(request: CellZomeCallRequest, timeout?: number) => {
    const callZomeResponse = await appWs.callZome(
      {
        ...request,
        cell_id: cell.cell_id,
        payload: request.payload ?? null,
      },
      timeout,
    );
    assertZomeResponse<T>(callZomeResponse);
    return callZomeResponse;
  },
});

/**
 * Get a shorthand function to call a cell's zome.
 *
 * @param cell - The cell to call the zome on.
 * @param zomeName - The name of the Zome to call.
 * @returns A function to call the specified Zome.
 *
 * @public
 */
export const getZomeCaller =
  (cell: CallableCell, zomeName: string) =>
  <T>(fnName: string, payload?: unknown, timeout?: number): Promise<T> =>
    cell.callZome<T>(
      {
        zome_name: zomeName,
        fn_name: fnName,
        payload,
      },
      timeout,
    );
