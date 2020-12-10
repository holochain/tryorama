#!/bin/bash

REV=cf4e72416e5afbf29b86d66a3d47ab2f9f6a65d2

cargo install --force holochain \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install --force dna_util \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
