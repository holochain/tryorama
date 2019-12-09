import { downloadFile } from "../src/util";
import { mkdirIdempotent } from "../src/config";

mkdirIdempotent('dna').then(() => {
  downloadFile({
    url: 'https://github.com/holochain/passthrough-dna/releases/download/v0.0.5/passthrough-dna.dna.json', 
    path: './dna/passthrough-dna.dna.json'
  })
})

