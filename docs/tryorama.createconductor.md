<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [createConductor](./tryorama.createconductor.md)

## createConductor() function

The function to create a conductor. It starts a sandbox conductor via the Holochain CLI.

**Signature:**

```typescript
createConductor: (signalingServerUrl: URL, options?: ConductorOptions) => Promise<Conductor>
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  signalingServerUrl | URL |  |
|  options | [ConductorOptions](./tryorama.conductoroptions.md) | _(Optional)_ |

**Returns:**

Promise&lt;[Conductor](./tryorama.conductor.md)<!-- -->&gt;

A conductor instance.

