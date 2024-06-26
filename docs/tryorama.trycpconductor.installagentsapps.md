<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [TryCpConductor](./tryorama.trycpconductor.md) &gt; [installAgentsApps](./tryorama.trycpconductor.installagentsapps.md)

## TryCpConductor.installAgentsApps() method

Install a hApp bundle into the conductor.

**Signature:**

```typescript
installAgentsApps(options: AgentsAppsOptions): Promise<import("@holochain/client").AppInfo[]>;
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

options


</td><td>

[AgentsAppsOptions](./tryorama.agentsappsoptions.md)


</td><td>

Apps to install for each agent, with agent pub keys etc.


</td></tr>
</tbody></table>
**Returns:**

Promise&lt;import("@holochain/client").AppInfo\[\]&gt;

The installed app infos.

