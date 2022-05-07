import { v4 as uuidv4 } from "uuid";
import { AppSignalCb, DnaSource } from "@holochain/client";
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

export class LocalScenario {
  private timeout: number | undefined;
  uid: string;
  conductors: LocalConductor[];

  constructor(options?: { timeout?: number }) {
    this.timeout = options?.timeout;
    this.uid = uuidv4();
    this.conductors = [];
  }

  async addPlayer(
    dnas: DnaSource[],
    signalHandler?: AppSignalCb
  ): Promise<LocalPlayer> {
    const conductor = await createLocalConductor({ timeout: this.timeout });
    const [agentCells] = await conductor.installAgentsHapps({
      agentsDnas: [dnas],
      uid: this.uid,
      signalHandler,
    });
    this.conductors.push(conductor);
    return { conductor, ...agentCells };
  }

  async addPlayers(
    playersDnas: DnaSource[][],
    signalHandlers?: Array<AppSignalCb | undefined>
  ): Promise<LocalPlayer[]> {
    const players = await Promise.all(
      playersDnas.map((playerDnas, i) =>
        this.addPlayer(playerDnas, signalHandlers?.[i])
      )
    );
    return players;
  }

  async cleanUp() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
    await cleanAllConductors();
    this.conductors = [];
  }
}
