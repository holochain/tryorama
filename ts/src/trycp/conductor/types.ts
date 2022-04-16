import { HoloHash, MembraneProof, RoleId } from "@holochain/client";

/**
 * @public
 */
export type DnaInstallOptions = {
  hash: HoloHash;
  role_id: RoleId;
  membrane_proof?: MembraneProof;
};
