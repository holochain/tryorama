import { HoloHash, MembraneProof, RoleId } from "@holochain/client";

/**
 * @public
 */
export type DnaInstallOptions = {
  hash: HoloHash;
  role_id: RoleId;
  membrane_proof?: MembraneProof;
};

/**
 * @public
 */
export type ZomeResponsePayload =
  | string
  | HoloHash
  | Record<number | string, boolean | number | string | object>;
