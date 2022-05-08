import { v4 as uuidv4 } from "uuid";
import { AppBundleSource, AppSignalCb, DnaSource } from "@holochain/client";
import {
  cleanAllConductors,
  createLocalConductor,
  LocalConductor,
} from "./conductor";
import { HappBundleOptions, Player, Scenario } from "../types";

/**
 * @public
 */
export interface LocalPlayer extends Player {
  conductor: LocalConductor;
}

export class LocalScenario implements Scenario {
  private timeout: number | undefined;
  uid: string;
  conductors: LocalConductor[];

  constructor(options?: { timeout?: number }) {
    this.timeout = options?.timeout;
    this.uid = uuidv4();
    this.conductors = [];
  }

  async addPlayerWithDnas(
    dnas: DnaSource[],
    signalHandler?: AppSignalCb
  ): Promise<LocalPlayer> {
    const conductor = await createLocalConductor({ timeout: this.timeout });
    const [agentCells] = await conductor.installAgentsHapps({
      agentsDnas: [dnas],
      uid: this.uid,
    });
    await conductor.attachAppInterface();
    await conductor.connectAppInterface(signalHandler);
    this.conductors.push(conductor);
    return { conductor, ...agentCells };
  }

  async addPlayersWithDnas(
    playersDnas: DnaSource[][],
    signalHandlers?: Array<AppSignalCb | undefined>
  ): Promise<LocalPlayer[]> {
    const players = await Promise.all(
      playersDnas.map((playerDnas, i) =>
        this.addPlayerWithDnas(playerDnas, signalHandlers?.[i])
      )
    );
    return players;
  }

  async addPlayerWithHappBundle(
    appBundleSource: AppBundleSource,
    options?: HappBundleOptions & { signalHandler?: AppSignalCb }
  ): Promise<LocalPlayer> {
    const conductor = await createLocalConductor({ timeout: this.timeout });
    options = options
      ? Object.assign(options, { uid: options.uid ?? this.uid })
      : { uid: this.uid };
    const agentHapp = await conductor.installHappBundle(
      appBundleSource,
      options
    );
    await conductor.attachAppInterface();
    await conductor.connectAppInterface(options?.signalHandler);
    this.conductors.push(conductor);
    return { conductor, ...agentHapp };
  }

  async addPlayersWithHappBundles(
    playersHappBundles: Array<{
      appBundleSource: AppBundleSource;
      options?: HappBundleOptions & { signalHandler?: AppSignalCb };
    }>
  ) {
    const players = await Promise.all(
      playersHappBundles.map((playerHappBundle) =>
        this.addPlayerWithHappBundle(
          playerHappBundle.appBundleSource,
          playerHappBundle.options
        )
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
