import { Barretenberg, Fr } from '@aztec/bb.js';
import { Tree } from './../src/merkle-tree';
import { bigIntToFr, frAdd, frToBigInt, FrHashed, frToNoir, pub_input_hash, sign_acc_tx } from '../src/util';
import { Account, State, blank_account_tx, blank_file_tx, new_account_tx } from '../src/state';
import { cpus } from 'os';
import { ShardedStorageSettings, defShardedStorageSettings } from '../src/settings';
import { blank_mining_tx } from '../src/mining';
import { RandomOracle, Field, RollupInput, RollupPubInput, Root, circuits, circuits_circuit, AccountTx, AccountTxEx } from '../src/noir_codegen';

import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';

import { prove, verify, ProverToml, VerifierToml } from '../src/nargo-wrapper'

import {
    derivePublicKey,
    signMessage,
    verifySignature,
    deriveSecretScalar,
    packPublicKey,
    unpackPublicKey
} from "@zk-kit/eddsa-poseidon"

import { Worker } from 'worker_threads';
Worker.setMaxListeners(2000);

describe('State', () => {

  test('Run meaningful transactions on genesis state', async () => {
    let bb = await Barretenberg.new({ threads: cpus().length });
    const sett = defShardedStorageSettings;

    const sk = "mypassword";
    const pk = derivePublicKey(sk);

    let first_acc = new Account();

    first_acc.key = bigIntToFr(pk[0]);
    first_acc.balance = bigIntToFr(1000000n);
    first_acc.nonce = Fr.ZERO;
    first_acc.random_oracle_nonce = Fr.ZERO;

    let st = await State.genesisState(bb, first_acc, sett);
    const st_hash = await st.hash(bb);
    const st_root: Root = {
      acc: frToNoir(await st.accounts.hash(bb)),
      data: frToNoir(await st.files.hash(bb)),
    };

    const pubInput: RollupPubInput = {
      old_root: frToNoir(st_hash),
      new_root: frToNoir(st_hash),
      now: "0",
      oracle: {
        offset: "0",
        data: new Array(sett.oracle_len).fill("0"),
      } as RandomOracle,
    };
    const pubInputHash = frToBigInt(pub_input_hash(sett, pubInput)).toString();

    const rec_pk = derivePublicKey("receiver password");

    let acc_txs = new Array(sett.account_tx_per_block).fill(blank_account_tx(sett));
    let tx: AccountTx = {
      sender_index: "0",
      receiver_index: "0",
      receiver_key: "1",
      amount: "10",
      nonce: "0",
    };
    const sign = sign_acc_tx(sk, tx);
    let txex: AccountTxEx = {
      tx: tx,
      assets: await st.build_account_tx_assets(tx, sign),
    }
    acc_txs[0] = txex;

    let input: RollupInput = {
      public: pubInput,
      tx: {
        txs: acc_txs,
      },
      file: {
        txs: new Array(sett.file_tx_per_block).fill(blank_file_tx(sett)),
      },
      mining: {
        txs: new Array(sett.mining_tx_per_block).fill(blank_mining_tx(sett)),
      },
      old_root: st_root,
      new_root: st_root,
    };

    const prover_data: ProverToml = {
      pubhash: pubInputHash,
      input: input
    };

    const verifier_data: VerifierToml = {
      pubhash: pubInputHash,
    };

    const proof = prove("../circuits/", prover_data);
    console.log(`proof = ${proof}`);

    expect(
      verify("../circuits/", verifier_data, proof)
    ).toEqual(true);

    const corrupted_proof = "deadbeef" + proof;
    expect(
      verify("../circuits/", verifier_data, corrupted_proof)
    ).toEqual(false);

    bb.destroy();
  }, 10 * 60 * 1000); // 10 minutes

  test('Run blank transactions on genesis state', async () => {
    let bb = await Barretenberg.new({ threads: cpus().length });
    const sett = defShardedStorageSettings;

    const sk = "mypassword";
    const pk = derivePublicKey(sk);

    let first_acc = new Account();

    first_acc.key = bigIntToFr(pk[0]);
    first_acc.balance = bigIntToFr(1000000n);
    first_acc.nonce = Fr.ZERO;
    first_acc.random_oracle_nonce = Fr.ZERO;

    let st = await State.genesisState(bb, first_acc, sett);
    const st_hash = await st.hash(bb);
    const st_root: Root = {
      acc: frToNoir(await st.accounts.hash(bb)),
      data: frToNoir(await st.files.hash(bb)),
    };

    const pubInput: RollupPubInput = {
      old_root: frToNoir(st_hash),
      new_root: frToNoir(st_hash),
      now: "0",
      oracle: {
        offset: "0",
        data: new Array(sett.oracle_len).fill("0"),
      } as RandomOracle,
    };
    const pubInputHash = frToBigInt(pub_input_hash(sett, pubInput)).toString();

    let input: RollupInput = {
      public: pubInput,
      tx: {
        txs: new Array(sett.account_tx_per_block).fill(blank_account_tx(sett)),
      },
      file: {
        txs: new Array(sett.file_tx_per_block).fill(blank_file_tx(sett)),
      },
      mining: {
        txs: new Array(sett.mining_tx_per_block).fill(blank_mining_tx(sett)),
      },
      old_root: st_root,
      new_root: st_root,
    };

    const prover_data: ProverToml = {
      pubhash: pubInputHash,
      input: input
    };

    const verifier_data: VerifierToml = {
      pubhash: pubInputHash,
    };

    const proof = prove("../circuits/", prover_data);
    console.log(`proof = ${proof}`);

    expect(
      verify("../circuits/", verifier_data, proof)
    ).toEqual(true);

    const corrupted_proof = "deadbeef" + proof;
    expect(
      verify("../circuits/", verifier_data, corrupted_proof)
    ).toEqual(false);

    bb.destroy();
  }, 10 * 60 * 1000); // 10 minutes

});
