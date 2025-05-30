<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [Scenario](./tryorama.scenario.md)

## Scenario class

An abstraction of a test scenario to write tests against Holochain hApps, running on a local conductor.

**Signature:**

```typescript
export declare class Scenario 
```

## Constructors

<table><thead><tr><th>

Constructor


</th><th>

Modifiers


</th><th>

Description


</th></tr></thead>
<tbody><tr><td>

[(constructor)(options)](./tryorama.scenario._constructor_.md)


</td><td>


</td><td>

Scenario constructor.


</td></tr>
</tbody></table>

## Properties

<table><thead><tr><th>

Property


</th><th>

Modifiers


</th><th>

Type


</th><th>

Description


</th></tr></thead>
<tbody><tr><td>

[bootstrapServerUrl](./tryorama.scenario.bootstrapserverurl.md)


</td><td>


</td><td>

URL \| undefined


</td><td>


</td></tr>
<tr><td>

[conductors](./tryorama.scenario.conductors.md)


</td><td>


</td><td>

[Conductor](./tryorama.conductor.md)<!-- -->\[\]


</td><td>


</td></tr>
<tr><td>

[disableLocalServices](./tryorama.scenario.disablelocalservices.md)


</td><td>


</td><td>

boolean \| undefined


</td><td>


</td></tr>
<tr><td>

[dpkiNetworkSeed](./tryorama.scenario.dpkinetworkseed.md)


</td><td>


</td><td>

string


</td><td>


</td></tr>
<tr><td>

[networkSeed](./tryorama.scenario.networkseed.md)


</td><td>


</td><td>

string


</td><td>


</td></tr>
<tr><td>

[noDpki](./tryorama.scenario.nodpki.md)


</td><td>


</td><td>

boolean


</td><td>


</td></tr>
<tr><td>

[serviceProcess](./tryorama.scenario.serviceprocess.md)


</td><td>


</td><td>

ChildProcessWithoutNullStreams \| undefined


</td><td>


</td></tr>
<tr><td>

[signalingServerUrl](./tryorama.scenario.signalingserverurl.md)


</td><td>


</td><td>

URL \| undefined


</td><td>


</td></tr>
</tbody></table>

## Methods

<table><thead><tr><th>

Method


</th><th>

Modifiers


</th><th>

Description


</th></tr></thead>
<tbody><tr><td>

[addConductor()](./tryorama.scenario.addconductor.md)


</td><td>


</td><td>

Create and add a conductor to the scenario.


</td></tr>
<tr><td>

[addPlayers(amount, networkConfig)](./tryorama.scenario.addplayers.md)


</td><td>


</td><td>

Create conductors with agents and add them to the scenario.

The specified number of conductors is created and one agent is generated on each conductor.


</td></tr>
<tr><td>

[addPlayersWithApps(appsWithOptions)](./tryorama.scenario.addplayerswithapps.md)


</td><td>


</td><td>

Create and add multiple players to the scenario, with an app installed for each player.


</td></tr>
<tr><td>

[addPlayersWithSameApp(appWithOptions, amount)](./tryorama.scenario.addplayerswithsameapp.md)


</td><td>


</td><td>

Create and add multiple players to the scenario, with the same app installed for each player.


</td></tr>
<tr><td>

[addPlayerWithApp(appWithOptions)](./tryorama.scenario.addplayerwithapp.md)


</td><td>


</td><td>

Create and add a single player with an app installed to the scenario.


</td></tr>
<tr><td>

[cleanUp()](./tryorama.scenario.cleanup.md)


</td><td>


</td><td>

Shut down and delete all conductors in the scenario.


</td></tr>
<tr><td>

[installAppsForPlayers(appsWithOptions, players)](./tryorama.scenario.installappsforplayers.md)


</td><td>


</td><td>

Installs the provided apps for the provided players.

The number of players must be at least as high as the number of apps.

\# Errors

If any of the app options contains an agent pub key, an error is thrown, because the agent pub keys of the players will be used for app installation.


</td></tr>
<tr><td>

[installSameAppForPlayers(appWithOptions, players)](./tryorama.scenario.installsameappforplayers.md)


</td><td>


</td><td>

Installs the same provided app for the provided players.


</td></tr>
<tr><td>

[shareAllAgents()](./tryorama.scenario.shareallagents.md)


</td><td>


</td><td>

Register all agents of all passed in conductors to each other. This skips peer discovery through gossip and thus accelerates test runs.


</td></tr>
<tr><td>

[shutDown()](./tryorama.scenario.shutdown.md)


</td><td>


</td><td>

Shut down all conductors in the scenario.


</td></tr>
</tbody></table>
