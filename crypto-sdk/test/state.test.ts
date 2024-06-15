import { Barretenberg, Fr } from '@aztec/bb.js';
import { Tree } from './../src/merkle-tree';
import { bigIntToFr, frAdd, frToBigInt, FrHashed, frToNoir, pub_input_hash, pad_array, prep_account_tx, prep_file_tx, prep_mining_tx } from '../src/util';
import { Account, State, blank_account_tx, blank_file_tx, new_account_tx } from '../src/state';
import { cpus } from 'os';
import { ShardedStorageSettings, defShardedStorageSettings } from '../src/settings';
import { blank_mining_tx, mine } from '../src/mining';
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
    let nonce = 0n;
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
    let nonce1 = 0n;
    const rec1_pk = derivePublicKey(rec1_sk);
    const tx_sign1 = await prep_account_tx(bb, 10n, 0, 1, sk, rec1_pk[0], nonce++);
    const txex1 = await st.build_account_txex(tx_sign1);

    // Transcation #2: rec1 10 tokens → rec2
    const rec2_sk = "receiver password";
    let nonce2 = 0n;
    const rec2_pk = derivePublicKey(rec2_sk);
    const tx_sign2 = await prep_account_tx(bb, 10n, 1, 2, rec1_sk, rec2_pk[0], nonce1++);
    const txex2 = await st.build_account_txex(tx_sign2);

    // Transcation #3: master 228 tokens → rec2
    // nonce == 1 here because nonce == 0 was used in Transcation #1
    const tx_sign3 = await prep_account_tx(bb, 228n, 0, 2, sk, rec2_pk[0], nonce++);
    const txex3 = await st.build_account_txex(tx_sign3);

    // Collect account transactions into one array
    const acc_txs = pad_array([txex1, txex2, txex3], sett.account_tx_per_block, blank_account_tx(sett));

    // ===== File transactions =====

    const now = 0n;

    // File Transcation #1: master creates a file #0 with all 5s
    const fives = await Tree.init(bb, sett.file_tree_depth,
      pad_array([], 1 << sett.file_tree_depth, new FrHashed(bigIntToFr(5n)))
    );
    const ftx1 = await prep_file_tx(bb, 10n, 0, 0, frToBigInt(await fives.hash(bb)), sk, nonce++);
    const ftxex1 = await st.build_file_txex(bb, now, fives, ftx1);

    // File Transcation #2: rec2 adds another file #1 that contains sequence of numbers 0, 1, …
    const count_file = await Tree.init(bb, sett.file_tree_depth,
      Array.from(
        { length: 1 << sett.file_tree_depth },
        (_, i) => new FrHashed(bigIntToFr(BigInt(i))),
      )
    );
    const ftx2 = await prep_file_tx(bb, 100n, 2, 1, frToBigInt(await count_file.hash(bb)), rec2_sk, nonce2++);
    const ftxex2 = await st.build_file_txex(bb, now, count_file, ftx2);

    // Collect file transactions
    const file_txs = pad_array([ftxex1, ftxex2], sett.file_tx_per_block, blank_file_tx(sett));

    // ===== Mining transactions =====

    let ro_offset= 0n;
    const ro_values = Array.from({length: sett.oracle_len}, (_, index) => bigIntToFr(BigInt(index)));
    const file_reader = (file_id: bigint, word_id: bigint): Fr => {
      const [_f_prf, f] = st.files.readLeaf(Number(file_id));
      const [_w_prf, w] = f.data.readLeaf(Number(word_id));
      return w;
    };

    // Mining Transcation #1, rec2 mines
    const ro_off1 = ro_values.length - 2; // just as example
    const ro_val1 = ro_values[ro_off1];
    const mres1 = await mine(bb, sett, bigIntToFr(rec2_pk[0]), ro_values[ro_off1], file_reader);
    const mtx1 = await prep_mining_tx(bb, 2, mres1, rec2_sk, nonce2++, ro_offset + BigInt(ro_off1));
    const mtxex1 = await st.build_mining_txex(bb, mres1, mtx1);

    // TODO: prepare some non-blank transactions to put here
    const mining_txs = pad_array([mtxex1], sett.mining_tx_per_block, blank_mining_tx(sett));

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
      now: now.toString(),
      oracle: {
        offset: ro_offset.toString(),
        data: ro_values.map((x) => x.toString()),
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

    // TODO: chage now value here and verify another transaction, making sure
    // that expired files can be overwritten

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
