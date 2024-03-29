<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [runScenario](./tryorama.runscenario.md)

## runScenario() function

A wrapper function to create and run a scenario. A scenario is created and all involved conductors are shut down and cleaned up after running.

**Signature:**

```typescript
runScenario: (testScenario: (scenario: Scenario) => Promise<void>, cleanUp?: boolean, options?: ScenarioOptions) => Promise<void>
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  testScenario | (scenario: [Scenario](./tryorama.scenario.md)<!-- -->) =&gt; Promise&lt;void&gt; | The test to be run. |
|  cleanUp | boolean | _(Optional)_ Whether to delete conductors after running. |
|  options | [ScenarioOptions](./tryorama.scenariooptions.md) | _(Optional)_ |

**Returns:**

Promise&lt;void&gt;

