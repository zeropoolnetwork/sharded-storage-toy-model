import { Barretenberg, Fr } from '@aztec/bb.js';
import { Tree } from './../src/merkle-tree';
import { bigIntToFr, frAdd, frToBigInt, FrHashed, frToNoir, pub_input_hash, sign_acc_tx, pad_array, prep_account_tx } from '../src/util';
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

    // Initialize the master account that holds all the tokens in the genesis state
    const sk = "mypassword";
    const pk = derivePublicKey(sk);
    let first_acc = new Account();
    first_acc.key = bigIntToFr(pk[0]);
    first_acc.balance = bigIntToFr(1000000n);
    first_acc.nonce = Fr.ZERO;
    first_acc.random_oracle_nonce = Fr.ZERO;

    // Initialize genesis state
    let st = await State.genesisState(bb, first_acc, sett);
    const st_hash = await st.hash(bb);
    const st_root: Root = {
      acc: frToNoir(await st.accounts.hash(bb)),
      data: frToNoir(await st.files.hash(bb)),
    };

    // ===== Account transactions =====

    // Transcation #1: master 10 tokens → rec1
    const rec1_sk = "receiver password";
    const rec1_pk = derivePublicKey(rec1_sk);
    const tx_sign1 = await prep_account_tx(bb, 10n, 0, 1, sk, rec1_pk[0], 0n);
    const txex1 = await st.build_account_txex(tx_sign1);

    // Transcation #2: rec1 10 tokens → rec2
    const rec2_sk = "receiver password";
    const rec2_pk = derivePublicKey(rec2_sk);
    const tx_sign2 = await prep_account_tx(bb, 10n, 1, 2, rec1_sk, rec2_pk[0], 0n);
    const txex2 = await st.build_account_txex(tx_sign2);

    // Transcation #3: master 228 tokens → rec2
    const tx_sign3 = await prep_account_tx(bb, 228n, 0, 2, sk, rec2_pk[0], 0n);
    const txex3 = await st.build_account_txex(tx_sign3);

    // Collect account transactions into one array
    const acc_txs = pad_array([txex1, txex2], sett.account_tx_per_block, blank_account_tx(sett));

    // ===== File transactions =====

    // TODO: prepare some non-blank transactions to put here
    const file_txs = pad_array([], sett.file_tx_per_block, blank_file_tx(sett));

    // ===== Mining transactions =====

    // TODO: prepare some non-blank transactions to put here
    const mining_txs = pad_array([], sett.mining_tx_per_block, blank_mining_tx(sett));

    // Compute the new hash
    const new_st_root: Root = {
      acc: frToNoir(await st.accounts.hash(bb)),
      data: frToNoir(await st.files.hash(bb)),
    };
    const new_st_hash = await st.hash(bb);

    // Public input known to contract
    const pubInput: RollupPubInput = {
      old_root: frToNoir(st_hash),
      new_root: frToNoir(new_st_hash),
      now: "0",
      oracle: {
        offset: "0",
        data: new Array(sett.oracle_len).fill("0"),
      },
    };
    const pubInputHash = frToBigInt(pub_input_hash(sett, pubInput)).toString();

    // Private input known to rollup
    let input: RollupInput = {
      public: pubInput,
      tx: {
        txs: acc_txs,
      },
      file: {
        txs: file_txs,
      },
      mining: {
        txs: mining_txs,
      },
      old_root: st_root,
      new_root: new_st_root,
    };

    // ===== Run Nargo verifier =====

    const prover_data: ProverToml = {
      pubhash: pubInputHash,
      input: input
    };

    const verifier_data: VerifierToml = {
      pubhash: pubInputHash,
    };

    const proof = prove("../circuits/", prover_data);

    expect(
      verify("../circuits/", verifier_data, proof)
    ).toEqual(true);

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
      },
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
