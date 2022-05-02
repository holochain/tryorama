import { DnaSource } from "@holochain/client";
import { v4 as uuidv4 } from "uuid";
import { CallableCell } from "../types";
import { createLocalConductor, LocalConductor } from "./conductor";

export type Player = {
  conductor: LocalConductor;
  agentPubKey: Uint8Array;
  cells: CallableCell[];
};

export class Scenario {
  uid: string;
  conductors: LocalConductor[];

  constructor() {
    this.uid = uuidv4();
    this.conductors = [];
  }

  async addPlayer(dnas: DnaSource[]): Promise<Player> {
    const conductor = await createLocalConductor();
    const [agentCells] = await conductor.installAgentsDnas({
      agentsDnas: [dnas],
      uid: this.uid,
    });
    this.conductors.push(conductor);
    return { conductor, ...agentCells };
  }

  async addPlayers(playersDnas: DnaSource[][]): Promise<Player[]> {
    const players: Player[] = [];
    for (const playerDnas of playersDnas) {
      const player = await this.addPlayer(playerDnas);
      players.push(player);
    }
    return players;
  }

  async cleanUp() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
    this.conductors = [];
  }
}
