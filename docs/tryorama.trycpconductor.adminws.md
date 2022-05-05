<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@holochain/tryorama](./tryorama.md) &gt; [TryCpConductor](./tryorama.trycpconductor.md) &gt; [adminWs](./tryorama.trycpconductor.adminws.md)

## TryCpConductor.adminWs() method

<b>Signature:</b>

```typescript
adminWs(): {
        addAgentInfo: (request: AddAgentInfoRequest) => Promise<import("..").AdminApiResponseAgentInfoAdded>;
        attachAppInterface: (request?: AttachAppInterfaceRequest | undefined) => Promise<{
            port: number;
        }>;
        connectAppInterface: () => Promise<null>;
        disconnectAppInterface: () => Promise<null>;
        dumpFullState: (request: DumpFullStateRequest) => Promise<FullStateDump>;
        dumpState: (request: DumpStateRequest) => Promise<[FullStateDump, string]>;
        enableApp: (request: EnableAppRequest) => Promise<import("@holochain/client").EnableAppResponse>;
        generateAgentPubKey: () => Promise<AgentPubKey>;
        installApp: (data: InstallAppRequest) => Promise<import("@holochain/client").InstalledAppInfo>;
        registerDna: (request: RegisterDnaRequest & DnaSource) => Promise<DnaHash>;
        requestAgentInfo: (req: RequestAgentInfoRequest) => Promise<import("@holochain/client").RequestAgentInfoResponse>;
    };
```
<b>Returns:</b>

{ addAgentInfo: (request: AddAgentInfoRequest) =&gt; Promise&lt;import("..").[AdminApiResponseAgentInfoAdded](./tryorama.adminapiresponseagentinfoadded.md)<!-- -->&gt;; attachAppInterface: (request?: AttachAppInterfaceRequest \| undefined) =&gt; Promise&lt;{ port: number; }&gt;; connectAppInterface: () =&gt; Promise&lt;null&gt;; disconnectAppInterface: () =&gt; Promise&lt;null&gt;; dumpFullState: (request: DumpFullStateRequest) =&gt; Promise&lt;FullStateDump&gt;; dumpState: (request: DumpStateRequest) =&gt; Promise&lt;\[FullStateDump, string\]&gt;; enableApp: (request: EnableAppRequest) =&gt; Promise&lt;import("@holochain/client").EnableAppResponse&gt;; generateAgentPubKey: () =&gt; Promise&lt;AgentPubKey&gt;; installApp: (data: InstallAppRequest) =&gt; Promise&lt;import("@holochain/client").InstalledAppInfo&gt;; registerDna: (request: RegisterDnaRequest &amp; DnaSource) =&gt; Promise&lt;DnaHash&gt;; requestAgentInfo: (req: RequestAgentInfoRequest) =&gt; Promise&lt;import("@holochain/client").RequestAgentInfoResponse&gt;; }
