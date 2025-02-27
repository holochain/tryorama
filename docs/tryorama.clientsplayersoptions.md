<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [ClientsPlayersOptions](./tryorama.clientsplayersoptions.md)

## ClientsPlayersOptions interface


**Signature:**

```typescript
export interface ClientsPlayersOptions 
```

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

[agentPubKeys?](./tryorama.clientsplayersoptions.agentpubkeys.md)


</td><td>


</td><td>

AgentPubKey\[\]


</td><td>

_(Optional)_ A list of previously generated agent pub keys (optional).


</td></tr>
<tr><td>

[app](./tryorama.clientsplayersoptions.app.md)


</td><td>


</td><td>

AppBundleSource


</td><td>

An app that will be installed for each agent.


</td></tr>
<tr><td>

[clientTimeout?](./tryorama.clientsplayersoptions.clienttimeout.md)


</td><td>


</td><td>

number


</td><td>

_(Optional)_ A timeout for the web socket connection (optional).


</td></tr>
<tr><td>

[numberOfAgentsPerConductor?](./tryorama.clientsplayersoptions.numberofagentsperconductor.md)


</td><td>


</td><td>

number


</td><td>

_(Optional)_ Number of agents per conductor. Defaults to 1.


</td></tr>
<tr><td>

[numberOfConductorsPerClient?](./tryorama.clientsplayersoptions.numberofconductorsperclient.md)


</td><td>


</td><td>

number


</td><td>

_(Optional)_ Number of conductors per client. Defaults to 1.


</td></tr>
<tr><td>

[partialConfig?](./tryorama.clientsplayersoptions.partialconfig.md)


</td><td>


</td><td>

string


</td><td>

_(Optional)_ Configuration for the conductor (optional).


</td></tr>
<tr><td>

[signalHandler?](./tryorama.clientsplayersoptions.signalhandler.md)


</td><td>


</td><td>

SignalCb


</td><td>

_(Optional)_ A signal handler to be registered in conductors.


</td></tr>
</tbody></table>
