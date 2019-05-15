# Bonus: Scenario Syntax Types

These are roughly the types for each syntax proposed, in case that's your thing. Warning, these may be out of date/incorrect.

### Common types

```ts
type AgentId = string
type DnaId = string
type InstanceId = string

type InstanceRef = {
    agentId: AgentId,
    dnaId: DnaId,
    call: (method: string, args: object) => any,
}
type InstanceMap = Map<InstanceId, InstanceRef>
```


### Syntax A

```ts
type ScenarioDef = {
    description: string,
    func: (ScenarioApi, InstanceMap) => ()
}
type ScenarioApi = {
    done: () => (),
    consistency: (ConsistencyClosure) => Promise<ConsistencyStats>
}
type ConsistencyClosure = (Map<InstanceId, AsyncInstanceRef>) => ()

// Same as InstanceRef, except `call` returns a Promise
type AsyncInstanceRef = {
    agentId: AgentId,
    dnaId: DnaId,
    call: (method: string, args: object) => Promise<any>,
}

type ConsistencyStats = ???
```


### Syntax B

```ts
type ScenarioDef = {
    description: string,
    func: (ScenarioApi, InstanceMap) => void | Promise<void>
}

type ScenarioApi = {
    done: () => (),
    consistency: (Array<InstanceRef>) => Promise<ConsistencyStats>
}

type ConsistencyStats = ???

```
