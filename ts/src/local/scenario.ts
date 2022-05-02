import { CallZomeRequest, DnaSource } from "@holochain/client";
import { v4 as uuidv4 } from "uuid";
import { createLocalConductor, LocalConductor } from "./conductor";

export class Scenario {
  uid: string;
  // conductors: LocalConductor[];

  constructor() {
    this.uid = uuidv4();
    // this.conductors = [];
  }

  async addPlayer(dnas: DnaSource[]) {
    const conductor = await createLocalConductor();
    const [agentsCells] = await conductor.installAgentsDnas({
      agentsDnas: [dnas],
      uid: this.uid,
    });
    agentsCells.cells.forEach((cell) => {
      // eslint-disable-next-line
      // @ts-ignore
      cell.callZome = async (
        request: Omit<CallZomeRequest, "cell_id"> & { provenance?: Uint8Array }
      ) =>
        conductor.callZome({
          ...request,
          provenance: request.provenance || agentsCells.agentPubKey,
          cell_id: cell.cell_id,
        });
    });
    return { conductor, agentsCells };
  }
}
