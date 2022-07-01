import {
  AgentPubKey,
  AppBundleSource,
  AppSignalCb,
  DnaSource,
} from "@holochain/client";
import { URL } from "url";
import { v4 as uuidv4 } from "uuid";
import { addAllAgentsToAllConductors as shareAllAgents } from "../../common.js";
import {
  AgentHapp,
  AgentHappOptions,
  HappBundleOptions,
  IPlayer,
} from "../../types.js";
import { TryCpClient } from "../trycp-client.js";
import { TryCpConductor } from "./conductor.js";

/**
 * @public
 */
export interface ClientsPlayersOptions {
  /**
   * A timeout for the web socket connection (optional).
   */
  clientTimeout?: number;

  /**
   * An array of DNAs that will be installed for each agent (optional).
   */
  dnas?: DnaSource[];

  /**
   * A list of previously generated agent pub keys (optional).
   */
  agentPubKeys?: AgentPubKey[];

  /**
   * Number of conductors per client. Default to 1.
   */
  numberOfConductorsPerClient?: number;

  /**
   * Number of agents per conductor. Defaults to 1. Requires `dnas` to be
   * specified.
   */
  numberOfAgentsPerConductor?: number;

  /**
   * A signal handler to be registered in conductors.
   */
  signalHandler?: AppSignalCb;
}

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
   * Creates a TryCP client connection and add it to the scenario.
   *
   * @param serverUrl - The TryCP server URL to connect to.
   * @param timeout - An optional timeout for the web socket connection.
   * @returns The created TryCP client.
   */
  async addClient(serverUrl: URL, timeout?: number) {
    const client = await TryCpClient.create(serverUrl, timeout);
    this.clients.push(client);
    return client;
  }

  /**
   * Creates client connections for all passed in URLs and, depending on the
   * options, creates multiple players with DNAs. Adds all clients to the
   * scenario.
   *
   * @param serverUrls - The TryCP server URLs to connect to.
   * @param options - {@link ClientsPlayersOptions}
   * @returns The created TryCP clients and all conductors per client and all
   * agents' hApps per conductor.
   */
  async addClientsPlayers(serverUrls: URL[], options?: ClientsPlayersOptions) {
    const clientsPlayers: Array<{
      client: TryCpClient;
      players: TryCpPlayer[];
    }> = [];

    // create client connections for specified URLs
    for (const serverUrl of serverUrls) {
      const client = await this.addClient(serverUrl, options?.clientTimeout);
      const players: TryCpPlayer[] = [];
      const numberOfConductorsPerClient =
        options?.numberOfConductorsPerClient ?? 1;

      // create conductors for each client
      for (let i = 0; i < numberOfConductorsPerClient; i++) {
        const conductor = await client.addConductor(options?.signalHandler);
        const numberOfAgentsPerConductor =
          options?.numberOfAgentsPerConductor ?? 1;

        if (options?.numberOfAgentsPerConductor) {
          // install agents hApps for each conductor
          if (options.dnas === undefined) {
            throw new Error("no DNAs specified to be installed for agents");
          }

          // TS fails to infer that options.dnas cannot be `undefined` here
          const dnas = options.dnas;

          let agentsDnas:
            | DnaSource[][]
            | Array<{ dnas: DnaSource[]; agentPubKey: AgentPubKey }>;
          if (options.agentPubKeys) {
            if (options.agentPubKeys.length !== options.dnas.length) {
              throw new Error(
                "number of agent pub keys doesn't match number of DNAs"
              );
            }
            agentsDnas = options.agentPubKeys.map((agentPubKey) => ({
              agentPubKey,
              dnas,
            }));
          } else {
            agentsDnas = [...Array(numberOfAgentsPerConductor)].map(() => dnas);
          }

          const installedAgentsHapps = await conductor.installAgentsHapps({
            agentsDnas,
          });
          installedAgentsHapps.forEach((agentHapps) =>
            players.push({ conductor, ...agentHapps })
          );
        }
      }
      clientsPlayers.push({ client, players });
    }
    return clientsPlayers;
  }

  /**
   * Creates and adds a single player to the scenario, with a set of DNAs
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
    });
    return { conductor, ...agentHapp };
  }

  /**
   * Creates and adds multiple players to the scenario, with a set of DNAs
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
   * Creates and adds a single player to the scenario, with a hApp bundle
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
   * Creates and adds multiple players to the scenario, with a hApp bundle
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
   * Registers all agents of all passed in conductors to each other. This skips
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
