import { Barretenberg, Fr } from '@aztec/bb.js';
import { Tree } from './../src/merkle-tree';
import { bigIntToFr, frAdd, frToBigInt, FrHashed, frToNoir, pub_input_hash } from '../src/util';
import { State, blank_account_tx, blank_file_tx, new_account_tx } from '../src/state';
import { cpus } from 'os';
import { ShardedStorageSettings, defShardedStorageSettings } from '../src/settings';
import { blank_mining_tx } from '../src/mining';
import { RandomOracle, RollupInput, RollupPubInput, Root, main, main_circuit } from '../src/noir_codegen';

import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';

import { Worker } from 'worker_threads';
Worker.setMaxListeners(2000);

describe('State', () => {

  test('Run blank transactions on genesis state', async () => {
    let bb = await Barretenberg.new({ threads: cpus().length });
    const sett = defShardedStorageSettings;

    let st = await State.genesisState(bb, sett);
    const st_hash = await st.hash(bb);
    const st_root: Root = {
      acc: frToNoir(await st.accounts.hash(bb)),
      data: frToNoir(await st.files.hash(bb)),
    };

    const txex = blank_account_tx(sett);

    console.log("building pub input");

    const pubInput: RollupPubInput = {
      old_root: frToNoir(st_hash),
      new_root: frToNoir(st_hash),
      now: "0",
      oracle: {
        offset: "0",
        data: new Array(sett.oracle_len).fill("0"),
      } as RandomOracle,
    };
    const pubInputHash = pub_input_hash(sett, pubInput);

    console.log("building input");

    let input: RollupInput = {
      public: pubInput,
      tx: {
        txs: new Array(sett.account_tx_per_block).fill(await blank_account_tx(sett)),
      },
      file: {
        txs: new Array(sett.file_tx_per_block).fill(await blank_file_tx(sett)),
      },
      mining: {
        txs: new Array(sett.mining_tx_per_block).fill(await blank_mining_tx(sett)),
      },
      old_root: st_root,
      new_root: st_root,
    };

    const backend = new BarretenbergBackend(main_circuit);
    const noir = new Noir(main_circuit, backend);
    console.log('logs', 'Generating proof... ⌛');
    const proof = await noir.generateProof({
      pubhash: frToNoir(pubInputHash),
      input: input,
    });
    console.log('logs', 'Generating proof... ✅');
    console.log('results', proof.proof);
    console.log('logs', 'Verifying proof... ⌛');
    const verification = await noir.verifyProof(proof);
    expect(verification).toEqual(true);
    console.log('logs', 'Verifying proof... ✅');

    bb.destroy();
  });

});
