import {
  type AgentPubKey,
  AppBundleSource,
  AppWebsocket,
} from "@holochain/client";
import assert from "node:assert";
import { ChildProcessWithoutNullStreams } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import {
  addAllAgentsToAllConductors,
  enableAndGetAgentApp,
  runLocalServices,
  stopLocalServices,
} from "./conductor-helpers.js";
import {
  cleanAllConductors,
  Conductor,
  createConductor,
  NetworkConfig,
} from "./conductor.js";
import { AgentApp, AppOptions } from "./types.js";

/**
 * A player consists of a {@link Conductor} and an agent pub key.
 *
 * @public
 */
export interface Player {
  agentPubKey: AgentPubKey;
  conductor: Conductor;
}

/**
 * @public
 */
export interface PlayerApp extends Player, AgentApp {
  appWs: AppWebsocket;
}

/**
 * @public
 */
export interface AppWithOptions {
  appBundleSource: AppBundleSource;
  options?: AppOptions;
  label?: string;
}

/**
 * Options when creating a scenario.
 *
 * @public
 */
export interface ScenarioOptions {
  // Timeout for requests to Admin and App API calls.
  timeout?: number;

  // Disable local bootstrap and signal server.
  //
  // This will prevent peers from reaching each other.
  //
  // Default: false
  disableLocalServices?: boolean;
}

/**
 * An abstraction of a test scenario to write tests against Holochain hApps,
 * running on a local conductor.
 *
 * @public
 */
export class Scenario {
  private timeout: number | undefined;
  noDpki: boolean;
  dpkiNetworkSeed: string;
  networkSeed: string;
  disableLocalServices: boolean | undefined;
  serviceProcess: ChildProcessWithoutNullStreams | undefined;
  bootstrapServerUrl: URL | undefined;
  signalingServerUrl: URL | undefined;
  conductors: Conductor[];

  /**
   * Scenario constructor.
   *
   * @param options - Timeout for requests to Admin and App API calls.
   */
  constructor(options?: ScenarioOptions) {
    this.timeout = options?.timeout;
    this.noDpki = false;
    this.dpkiNetworkSeed = uuidv4();
    this.networkSeed = uuidv4();
    this.disableLocalServices = options?.disableLocalServices ?? false;
    this.serviceProcess = undefined;
    this.bootstrapServerUrl = undefined;
    this.signalingServerUrl = undefined;
    this.conductors = [];
  }

  /**
   * Create and add a conductor to the scenario.
   *
   * @returns The newly added conductor instance.
   */
  async addConductor(networkConfig?: NetworkConfig, label?: string) {
    await this.ensureLocalServices();
    assert(this.serviceProcess);
    assert(this.signalingServerUrl);
    const defaultCreateOptions = {
      timeout: this.timeout,
      bootstrapServerUrl: this.bootstrapServerUrl,
      label,
    };
    const createOptions =
      networkConfig === undefined
        ? defaultCreateOptions
        : {
            ...defaultCreateOptions,
            ...(networkConfig as NetworkConfig),
          };
    const conductor = await createConductor(
      this.signalingServerUrl,
      createOptions,
    );
    this.conductors.push(conductor);
    return conductor;
  }

  /**
   * Create conductors with agents and add them to the scenario.
   *
   * The specified number of conductors is created and one agent is
   * generated on each conductor.
   *
   * @param amount - The number of players to be created.
   * @param networkConfig - Optional {@link NetworkConfig}
   * @returns An array of {@link Player}s
   */
  async addPlayers(
    amount: number,
    networkConfig?: NetworkConfig,
  ): Promise<Player[]> {
    await this.ensureLocalServices();
    return Promise.all(
      new Array(amount).fill(0).map(async (i) => {
        const conductor = await this.addConductor(networkConfig, `Player ${i}`);
        const agentPubKey = await conductor.adminWs().generateAgentPubKey();
        return { conductor, agentPubKey };
      }),
    );
  }

  /**
   * Installs the provided apps for the provided players.
   *
   * The number of players must be at least as high as the number of apps.
   *
   * # Errors
   *
   * If any of the app options contains an agent pub key, an error is thrown,
   * because the agent pub keys of the players will be used for app installation.
   *
   * @param appsWithOptions - The apps with options to be installed
   * @param players - The players the apps are installed for
   * @returns An array of player apps.
   */
  async installAppsForPlayers(
    appsWithOptions: AppWithOptions[],
    players: Player[],
  ) {
    if (
      appsWithOptions.some(
        (appWithOptions) => appWithOptions.options?.agentPubKey,
      )
    ) {
      throw new Error(
        "Agent pub key in app options must not be set. Agent pub keys are taken from the players.",
      );
    }
    await this.ensureLocalServices();
    return Promise.all(
      appsWithOptions.map((appWithOptions, i) => {
        const player = players[i];
        appWithOptions.options = appWithOptions.options ?? {};
        appWithOptions.options.agentPubKey = player.agentPubKey;
        return this.installPlayerApp(player.conductor, appWithOptions);
      }),
    );
  }

  /**
   * Installs the same provided app for the provided players.
   *
   * @param appsWithOptions - The app with options to be installed for all players
   * @param players - The players the apps are installed for
   * @returns An array of player apps.
   */
  async installSameAppForPlayers(
    appWithOptions: AppWithOptions,
    players: Player[],
  ) {
    if (appWithOptions.options?.agentPubKey) {
      throw new Error(
        "Agent pub key in app options must not be set. Agent pub keys are taken from the players.",
      );
    }
    await this.ensureLocalServices();
    return Promise.all(
      players.map((player) => {
        appWithOptions.options = appWithOptions.options ?? {};
        appWithOptions.options.agentPubKey = player.agentPubKey;
        return this.installPlayerApp(player.conductor, appWithOptions);
      }),
    );
  }

  /**
   * Create and add a single player with an app installed to the scenario.
   *
   * @param appBundleSource - The bundle or path to the bundle.
   * @param options - {@link AppOptions}.
   * @returns A player with the installed app.
   */
  async addPlayerWithApp(appWithOptions: AppWithOptions) {
    await this.ensureLocalServices();
    const conductor = await this.addConductor(
      appWithOptions.options?.networkConfig,
      appWithOptions.label,
    );
    appWithOptions.options = {
      ...appWithOptions.options,
      networkSeed: appWithOptions.options?.networkSeed ?? this.networkSeed,
    };
    return this.installPlayerApp(conductor, appWithOptions);
  }

  private async installPlayerApp(
    conductor: Conductor,
    appWithOptions: AppWithOptions,
  ): Promise<PlayerApp> {
    const appInfo = await conductor.installApp(appWithOptions);
    const adminWs = conductor.adminWs();
    const port = await conductor.attachAppInterface();
    const issued = await adminWs.issueAppAuthenticationToken({
      installed_app_id: appInfo.installed_app_id,
    });
    const appWs = await conductor.connectAppWs(issued.token, port);
    const agentApp: AgentApp = await enableAndGetAgentApp(
      adminWs,
      appWs,
      appInfo,
    );
    return { conductor, appWs, ...agentApp };
  }

  /**
   * Create and add multiple players to the scenario, with the same app installed
   * for each player.
   *
   * @param appsWithOptions - An app to be installed for each player
   * @returns All created player apps.
   */
  async addPlayersWithSameApp(appWithOptions: AppWithOptions, amount: number) {
    await this.ensureLocalServices();
    return Promise.all(
      new Array(amount)
        .fill(0)
        .map(() => this.addPlayerWithApp(appWithOptions)),
    );
  }

  /**
   * Create and add multiple players to the scenario, with an app installed
   * for each player.
   *
   * @param appsWithOptions - An array with an app for each player.
   * @returns All created player apps.
   */
  async addPlayersWithApps(appsWithOptions: AppWithOptions[]) {
    await this.ensureLocalServices();
    return Promise.all(
      appsWithOptions.map((appWithOptions, i) =>
        this.addPlayerWithApp({
          label: `Player ${i}`, // default label
          ...appWithOptions
        }),
      ),
    );
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
    if (this.serviceProcess) {
      await stopLocalServices(this.serviceProcess);
    }
  }

  /**
   * Shut down and delete all conductors in the scenario.
   */
  async cleanUp() {
    await this.shutDown();
    await cleanAllConductors();
    this.conductors = [];
    this.serviceProcess = undefined;
    this.bootstrapServerUrl = undefined;
    this.signalingServerUrl = undefined;
  }

  private async ensureLocalServices() {
    if (this.disableLocalServices) {
      this.bootstrapServerUrl = new URL("https://BAD_URL");
      this.signalingServerUrl = new URL("wss://BAD_URL");
    }

    if (!this.serviceProcess) {
      ({
        servicesProcess: this.serviceProcess,
        bootstrapServerUrl: this.bootstrapServerUrl,
        signalingServerUrl: this.signalingServerUrl,
      } = await runLocalServices());
    }
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
  options?: ScenarioOptions,
) => {
  const scenario = new Scenario(options);
  try {
    await testScenario(scenario);
  } catch (error) {
    console.error("error occurred during test run:", error);
    throw error;
  } finally {
    if (cleanUp) {
      await scenario.cleanUp();
    } else {
      await scenario.shutDown();
    }
  }
};
