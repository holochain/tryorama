import { v4 as uuidv4 } from "uuid";
import { AppBundleSource, AppSignalCb, DnaSource } from "@holochain/client";
import {
  cleanAllConductors,
  createLocalConductor,
  LocalConductor,
} from "./conductor";
import {
  AgentHappOptions,
  HappBundleOptions,
  Player,
  Scenario,
} from "../types";
import { makeLogger } from "../logger";

const logger = makeLogger("Scenario");

/**
 * A player tied to a {@link LocalConductor}.
 *
 * @public
 */
export interface LocalPlayer extends Player {
  conductor: LocalConductor;
}

/**
 * An abstraction of a test scenario to write tests against Holochain hApps,
 * running on a local conductor.
 *
 * @public
 */
export class LocalScenario implements Scenario {
  private timeout: number | undefined;
  uid: string;
  conductors: LocalConductor[];

  /**
   * LocalScenario constructor.
   *
   * @param options - Timeout for requests to Admin and App API calls.
   */
  constructor(options?: { timeout?: number }) {
    this.timeout = options?.timeout;
    this.uid = uuidv4();
    this.conductors = [];
  }

  /**
   * Create and add a conductor to the scenario.
   *
   * @param signalHandler - A callback function to handle signals.
   * @returns The newly added conductor instance.
   */
  async addConductor(signalHandler?: AppSignalCb) {
    const conductor = await createLocalConductor({ timeout: this.timeout });
    await conductor.attachAppInterface();
    await conductor.connectAppInterface(signalHandler);
    this.conductors.push(conductor);
    return conductor;
  }

  /**
   * Create and add a single player to the scenario, with a set of DNAs
   * installed.
   *
   * @param agentHappOptions - {@link AgentHappOptions}.
   * @returns A local player instance.
   */
  async addPlayerWithHapp(
    agentHappOptions: AgentHappOptions
  ): Promise<LocalPlayer> {
    const signalHandler = Array.isArray(agentHappOptions)
      ? undefined
      : agentHappOptions.signalHandler;
    const agentsDnas: DnaSource[][] = Array.isArray(agentHappOptions)
      ? [agentHappOptions]
      : [agentHappOptions.dnas];
    const conductor = await this.addConductor(signalHandler);
    const [agentHapp] = await conductor.installAgentsHapps({
      agentsDnas,
      uid: this.uid,
    });
    return { conductor, ...agentHapp };
  }

  /**
   * Create and add multiple players to the scenario, with a set of DNAs
   * installed for each player.
   *
   * @param agentHappOptions - {@link AgentHappOptions} for each player.
   * @returns An array with the added players.
   */
  async addPlayersWithHapps(
    agentHappOptions: AgentHappOptions[]
  ): Promise<LocalPlayer[]> {
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
  ): Promise<LocalPlayer> {
    const conductor = await this.addConductor(options?.signalHandler);
    options = options
      ? Object.assign(options, { uid: options.uid ?? this.uid })
      : { uid: this.uid };
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
 * and all involved conductors are shut down after running. Any error that
 * occurs during the test is logged.
 *
 * @param testScenario - The test to be run.
 * @param cleanUp - Whether to delete conductors after running.
 *
 * @public
 */
export const runScenario = async (
  testScenario: (scenario: LocalScenario) => Promise<void>,
  cleanUp = false
) => {
  const scenario = new LocalScenario();
  try {
    await testScenario(scenario);
  } catch (error) {
    logger.error(error);
  } finally {
    if (cleanUp) {
      await scenario.cleanUp();
    } else {
      await scenario.shutDown();
    }
  }
};
