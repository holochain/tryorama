import { v4 as uuidv4 } from "uuid";
import { DnaSource } from "@holochain/client";
import {
  cleanAllConductors,
  createLocalConductor,
  LocalConductor,
} from "./conductor";
import { Player } from "../types";

/**
 * @public
 */
export interface LocalPlayer extends Player {
  conductor: LocalConductor;
}

export class Scenario {
  private timeout: number | undefined;
  uid: string;
  conductors: LocalConductor[];

  constructor(options?: { timeout?: number }) {
    this.timeout = options?.timeout;
    this.uid = uuidv4();
    this.conductors = [];
  }

  async addPlayer(dnas: DnaSource[]): Promise<LocalPlayer> {
    const conductor = await createLocalConductor({ timeout: this.timeout });
    const [agentCells] = await conductor.installAgentsHapps({
      agentsDnas: [dnas],
      uid: this.uid,
    });
    this.conductors.push(conductor);
    return { conductor, ...agentCells };
  }

  async addPlayers(playersDnas: DnaSource[][]): Promise<LocalPlayer[]> {
    const players = await Promise.all(
      playersDnas.map((playerDnas) => this.addPlayer(playerDnas))
    );
    return players;
  }

  async cleanUp() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
    await cleanAllConductors();
    this.conductors = [];
  }
}
