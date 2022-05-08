import {
  AgentPubKey,
  CallZomeResponse,
  InstalledAppInfo,
} from "@holochain/client";
import { AgentHapp, CellZomeCallRequest, Conductor } from "./types";

export const addAllAgentsToAllConductors = async (conductors: Conductor[]) => {
  await Promise.all(
    conductors.map(async (playerToShareAbout, playerToShareAboutIdx) => {
      const agentInfosToShareAbout = await playerToShareAbout
        .adminWs()
        .requestAgentInfo({
          cell_id: null,
        });
      await Promise.all(
        conductors.map(async (playerToShareWith, playerToShareWithIdx) => {
          if (playerToShareAboutIdx !== playerToShareWithIdx) {
            playerToShareWith.adminWs().addAgentInfo({
              agent_infos: agentInfosToShareAbout,
            });
          }
        })
      );
    })
  );
};

function assertZomeResponse<T>(
  response: CallZomeResponse
): asserts response is T {
  return;
}

export const enableAndGetAgentHapp = async (
  conductor: Conductor,
  agentPubKey: AgentPubKey,
  installedAppInfo: InstalledAppInfo
) => {
  const enableAppResponse = await conductor.adminWs().enableApp({
    installed_app_id: installedAppInfo.installed_app_id,
  });
  if (enableAppResponse.errors.length) {
    throw new Error(`failed to enable app: ${enableAppResponse.errors}`);
  }
  const namedCells = new Map(
    installedAppInfo.cell_data.map((cell) => [cell.role_id, cell])
  );
  const cells = installedAppInfo.cell_data.map((cell) => ({
    ...cell,
    callZome: async <T>(request: CellZomeCallRequest) => {
      const callZomeResponse = await conductor.appWs().callZome({
        ...request,
        cap_secret: request.cap_secret || null,
        cell_id: cell.cell_id,
        provenance: request.provenance || agentPubKey,
      });
      assertZomeResponse<T>(callZomeResponse);
      return callZomeResponse;
    },
  }));
  const agentHapp: AgentHapp = {
    happId: installedAppInfo.installed_app_id,
    agentPubKey,
    cells,
    namedCells,
  };
  return agentHapp;
};
