import { AppBundleSource, AppSignalCb } from "@holochain/client";
import { URL } from "url";
import { v4 as uuidv4 } from "uuid";
import { addAllAgentsToAllConductors as shareAllAgents } from "../../common.js";
import { AgentHappOptions, HappBundleOptions, IPlayer } from "../../types.js";
import { TryCpClient } from "../trycp-client.js";
import { TryCpConductor } from "./conductor.js";

/**
 * A player tied to a {@link TryCpConductor}.
 *
 * @public
 */
export interface TryCpPlayer extends IPlayer {
  conductor: TryCpConductor;
}

/**
 * A test scenario abstraction with convenience functions to manage TryCP
 * clients and players (agent + conductor).
 *
 * Clients in turn help manage conductors on TryCP servers. Clients can be
 * added to a scenario to keep track of all server connections. When finishing
 * a test scenario, all conductors of all clients can be easily cleaned up and
 * the client connections closed.
 *
 * @public
 */
export class TryCpScenario {
  uid: string;
  clients: TryCpClient[];

  constructor() {
    this.uid = uuidv4();
    this.clients = [];
  }

  /**
   * Create a TryCP client connection and add it to the scenario.
   *
   * @param serverUrl - The TryCP server URL.
   * @param timeout - An optional timeout for the web socket connection.
   * @returns The created TryCP client.
   */
  async addClient(serverUrl: URL, timeout?: number) {
    const client = await TryCpClient.create(serverUrl, timeout);
    this.clients.push(client);
    return client;
  }

  /**
   * Create and add a single player to the scenario, with a set of DNAs
   * installed.
   *
   * @param tryCpClient - The client connection to the TryCP server on which to
   * create the player.
   * @param agentHappOptions - {@link AgentHappOptions}.
   * @returns The created player instance.
   */
  async addPlayerWithHapp(
    tryCpClient: TryCpClient,
    agentHappOptions: AgentHappOptions
  ): Promise<TryCpPlayer> {
    const signalHandler = Array.isArray(agentHappOptions)
      ? undefined
      : agentHappOptions.signalHandler;
    const agentsDnas = Array.isArray(agentHappOptions)
      ? [agentHappOptions]
      : [agentHappOptions.dnas];
    const conductor = await tryCpClient.addConductor(signalHandler);
    const [agentHapp] = await conductor.installAgentsHapps({
      agentsDnas,
      uid: this.uid,
      signalHandler,
    });
    return { conductor, ...agentHapp };
  }

  /**
   * Create and add multiple players to the scenario, with a set of DNAs
   * installed for each player.
   *
   * @param tryCpClient - The client connection to the TryCP server on which to
   * create the player.
   * @param agentHappOptions - {@link AgentHappOptions} for each player.
   * @returns An array of the added players.
   */
  async addPlayersWithHapps(
    tryCpClient: TryCpClient,
    agentHappOptions: AgentHappOptions[]
  ): Promise<TryCpPlayer[]> {
    const players = await Promise.all(
      agentHappOptions.map((options) =>
        this.addPlayerWithHapp(tryCpClient, options)
      )
    );
    return players;
  }

  /**
   * Create and add a single player to the scenario, with a hApp bundle
   * installed.
   *
   * @param tryCpClient - The client connection to the TryCP server on which to
   * create the player.
   * @param appBundleSource - The bundle or path to the bundle.
   * @param options - {@link HappBundleOptions} plus a signal handler
   * (optional).
   * @returns The created player instance.
   */
  async addPlayerWithHappBundle(
    tryCpClient: TryCpClient,
    appBundleSource: AppBundleSource,
    options?: HappBundleOptions & { signalHandler?: AppSignalCb }
  ) {
    const conductor = await tryCpClient.addConductor(options?.signalHandler);
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
   * @param tryCpClient - The client connection to the TryCP server on which to
   * create the player.
   * @param playersHappBundles - An array with a hApp bundle for each player,
   * and a signal handler (optional).
   * @returns An array of the added players.
   */
  async addPlayersWithHappBundles(
    tryCpClient: TryCpClient,
    playersHappBundles: Array<{
      appBundleSource: AppBundleSource;
      options?: HappBundleOptions & { signalHandler?: AppSignalCb };
    }>
  ) {
    const players = await Promise.all(
      playersHappBundles.map(async (playerHappBundle) =>
        this.addPlayerWithHappBundle(
          tryCpClient,
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
   */
  async shareAllAgents() {
    return shareAllAgents(
      this.clients.map((client) => client.conductors).flat()
    );
  }

  /**
   * Shut down all conductors of all clients in the scenario.
   */
  async shutDown() {
    await Promise.all(
      this.clients.map((client) => client.shutDownConductors())
    );
  }

  /**
   * Shut down and delete all conductors and close all client connections in
   * the scenario.
   */
  async cleanUp() {
    await Promise.all(this.clients.map((client) => client.cleanUp()));
    this.clients = [];
  }
}
