<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [Scenario](./tryorama.scenario.md) &gt; [addPlayers](./tryorama.scenario.addplayers.md)

## Scenario.addPlayers() method

Create conductors with agents and add them to the scenario.

The specified number of conductors is created and one agent is generated on each conductor.

**Signature:**

```typescript
addPlayers(amount: number, networkConfig?: NetworkConfig): Promise<Player[]>;
```

## Parameters

<table><thead><tr><th>

Parameter


</th><th>

Type


</th><th>

Description


</th></tr></thead>
<tbody><tr><td>

amount


</td><td>

number


</td><td>

The number of players to be created.


</td></tr>
<tr><td>

networkConfig


</td><td>

[NetworkConfig](./tryorama.networkconfig.md)


</td><td>

_(Optional)_ Optional [NetworkConfig](./tryorama.networkconfig.md)


</td></tr>
</tbody></table>
**Returns:**

Promise&lt;[Player](./tryorama.player.md)<!-- -->\[\]&gt;

An array of [Player](./tryorama.player.md)<!-- -->s

