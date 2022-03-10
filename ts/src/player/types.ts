import { HoloHash, MembraneProof, RoleId } from "@holochain/client";

export type DnaInstallOptions = {
  hash: HoloHash;
  role_id: RoleId;
  membrane_proof?: MembraneProof;
};
