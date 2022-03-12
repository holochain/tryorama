import { HoloHash, MembraneProof, RoleId } from "@holochain/client";

export type DnaInstallOptions = {
  hash: HoloHash;
  role_id: RoleId;
  membrane_proof?: MembraneProof;
};

export type ZomeResponsePayload =
  | HoloHash
  | Record<number | string, boolean | number | string | object>;
