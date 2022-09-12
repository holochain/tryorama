import { AppBundleSource, AppSignalCb } from "@holochain/client";
import { v4 as uuidv4 } from "uuid";
import { addAllAgentsToAllConductors } from "../common.js";
import {
  AgentDnas,
  HappBundleOptions,
  IPlayer,
  PlayerHappOptions,
} from "../types.js";
import { cleanAllConductors, Conductor, createConductor } from "./conductor.js";

/**
 * A player tied to a {@link Conductor}.
 *
 * @public
 */
export interface Player extends IPlayer {
  conductor: Conductor;
}

/**
 * Options when creating a scenario.
 *
 * @public
 */
export interface ScenarioOptions {
  // Timeout for requests to Admin and App API calls.
  timeout?: number;
}

/**
 * An abstraction of a test scenario to write tests against Holochain hApps,
 * running on a local conductor.
 *
 * @public
 */
export class Scenario {
  private timeout: number | undefined;
  networkSeed: string;
  conductors: Conductor[];

  /**
   * Scenario constructor.
   *
   * @param options - Timeout for requests to Admin and App API calls.
   */
  constructor(options?: ScenarioOptions) {
    this.timeout = options?.timeout;
    this.networkSeed = uuidv4();
    this.conductors = [];
  }

  /**
   * Create and add a conductor to the scenario.
   *
   * @param signalHandler - A callback function to handle signals.
   * @returns The newly added conductor instance.
   */
  async addConductor(signalHandler?: AppSignalCb) {
    const conductor = await createConductor({
      signalHandler,
      timeout: this.timeout,
    });
    this.conductors.push(conductor);
    return conductor;
  }

  /**
   * Create and add a single player to the scenario, with a set of DNAs
   * installed.
   *
   * @param playerHappOptions - {@link PlayerHappOptions}.
   * @returns A local player instance.
   */
  async addPlayerWithHapp(
    playerHappOptions: PlayerHappOptions
  ): Promise<Player> {
    const signalHandler = Array.isArray(playerHappOptions)
      ? undefined
      : playerHappOptions.signalHandler;
    const agentsDnas: AgentDnas[] = [
      {
        dnas: Array.isArray(playerHappOptions)
          ? playerHappOptions.map((dnaSource) => ({ source: dnaSource }))
          : playerHappOptions.dnas,
      },
    ];
    const conductor = await this.addConductor(signalHandler);
    const [agentHapp] = await conductor.installAgentsHapps({
      agentsDnas,
      networkSeed: this.networkSeed,
    });
    return { conductor, ...agentHapp };
  }

  /**
   * Create and add multiple players to the scenario, with a set of DNAs
   * installed for each player.
   *
   * @param agentHappOptions - {@link PlayerHappOptions} for each player.
   * @returns An array with the added players.
   */
  async addPlayersWithHapps(
    agentHappOptions: PlayerHappOptions[]
  ): Promise<Player[]> {
    const players = await Promise.all(
      agentHappOptions.map((options) => this.addPlayerWithHapp(options))
    );
    return players;
  }

  /**
   * Create and add a single player to the scenario, with a hApp bundle
   * installed.
   *
   * @param appBundleSource - The bundle or path to the bundle.
   * @param options - {@link HappBundleOptions} plus a signal handler
   * (optional).
   * @returns A local player instance.
   */
  async addPlayerWithHappBundle(
    appBundleSource: AppBundleSource,
    options?: HappBundleOptions & { signalHandler?: AppSignalCb }
  ): Promise<Player> {
    const conductor = await this.addConductor(options?.signalHandler);
    options = options
      ? Object.assign(options, {
          networkSeed: options.networkSeed ?? this.networkSeed,
        })
      : { networkSeed: this.networkSeed };
    const agentHapp = await conductor.installHappBundle(
      appBundleSource,
      options
    );
    return { conductor, ...agentHapp };
  }

  /**
   * Create and add multiple players to the scenario, with a hApp bundle
   * installed for each player.
   *
   * @param playersHappBundles - An array with a hApp bundle for each player,
   * and a signal handler (optional).
   * @returns
   */
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

  /**
   * Register all agents of all passed in conductors to each other. This skips
   * peer discovery through gossip and thus accelerates test runs.
   *
   * @public
   */
  async shareAllAgents() {
    return addAllAgentsToAllConductors(this.conductors);
  }

  /**
   * Shut down all conductors in the scenario.
   */
  async shutDown() {
    await Promise.all(this.conductors.map((conductor) => conductor.shutDown()));
  }

  /**
   * Shut down and delete all conductors in the scenario.
   */
  async cleanUp() {
    await this.shutDown();
    await cleanAllConductors();
    this.conductors = [];
  }
}

/**
 * A wrapper function to create and run a scenario. A scenario is created
 * and all involved conductors are shut down and cleaned up after running.
 *
 * @param testScenario - The test to be run.
 * @param cleanUp - Whether to delete conductors after running. @defaultValue true
 *
 * @public
 */
export const runScenario = async (
  testScenario: (scenario: Scenario) => Promise<void>,
  cleanUp = true,
  options?: ScenarioOptions
) => {
  const scenario = new Scenario(options);
  try {
    await testScenario(scenario);
  } finally {
    if (cleanUp) {
      await scenario.cleanUp();
    } else {
      await scenario.shutDown();
    }
  }
};
