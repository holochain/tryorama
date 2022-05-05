import { v4 as uuidv4 } from "uuid";
import { DnaSource } from "@holochain/client";
import { createLocalConductor, LocalConductor } from "./conductor";
import { Player } from "../types";

/**
 * @public
 */
export interface LocalPlayer extends Player {
  conductor: LocalConductor;
}

export class Scenario {
  uid: string;
  conductors: LocalConductor[];

  constructor() {
    this.uid = uuidv4();
    this.conductors = [];
  }

  async addPlayer(dnas: DnaSource[]): Promise<LocalPlayer> {
    const conductor = await createLocalConductor();
    const [agentCells] = await conductor.installAgentsHapps({
      agentsDnas: [dnas],
      uid: this.uid,
    });
    this.conductors.push(conductor);
    return { conductor, ...agentCells };
  }

  async addPlayers(playersDnas: DnaSource[][]): Promise<LocalPlayer[]> {
    const players: LocalPlayer[] = [];
    await Promise.all(
      playersDnas.map(async (playerDnas) => {
        const player = await this.addPlayer(playerDnas);
        players.push(player);
      })
    );
    return players;
  }

  async cleanUp() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
    this.conductors = [];
  }
}
