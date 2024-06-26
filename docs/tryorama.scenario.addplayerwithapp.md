<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [Scenario](./tryorama.scenario.md) &gt; [addPlayerWithApp](./tryorama.scenario.addplayerwithapp.md)

## Scenario.addPlayerWithApp() method

Create and add a single player with an app installed to the scenario.

**Signature:**

```typescript
addPlayerWithApp(appBundleSource: AppBundleSource, options?: AppOptions): Promise<Player>;
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

appBundleSource


</td><td>

AppBundleSource


</td><td>

The bundle or path to the bundle.


</td></tr>
<tr><td>

options


</td><td>

[AppOptions](./tryorama.appoptions.md)


</td><td>

_(Optional)_ [AppOptions](./tryorama.appoptions.md)<!-- -->.


</td></tr>
</tbody></table>
**Returns:**

Promise&lt;[Player](./tryorama.player.md)<!-- -->&gt;

A local player instance.

