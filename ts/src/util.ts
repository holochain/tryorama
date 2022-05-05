import { Conductor } from "./types";

export const pause = async (milliseconds: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

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
