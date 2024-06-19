import { Tree } from './../src/merkle-tree';
import { bigIntToFr, frAdd, Fr, fr_serialize, pub_input_hash, pad_array, prep_account_tx, prep_file_tx, prep_mining_tx } from '../src/util';
import { Account, State, blank_account_tx, blank_file_tx, new_account_tx } from '../src/state';
import { cpus } from 'os';
import { ShardedStorageSettings, defShardedStorageSettings } from '../src/settings';
import { blank_mining_tx, mine } from '../src/mining';
import { RandomOracle, Field, RollupInput, RollupPubInput, Root, circuits, circuits_circuit, AccountTx, AccountTxEx } from '../src/noir_codegen';

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

function id(x: Fr): Fr { return x }

describe('State', () => {

  test('Run meaningful transactions on genesis state', async () => {
    const sett = defShardedStorageSettings;

    // Initialize the master account that holds all the tokens in the genesis state
    const sk = "mypassword";
    let nonce = 0n;
    const pk = derivePublicKey(sk);
    let first_acc = new Account();
    first_acc.key = pk[0];
    first_acc.balance = bigIntToFr(1000000n);
    first_acc.nonce = 0n;
    first_acc.random_oracle_nonce = 0n;

    // Initialize genesis state
    let st = await State.genesisState(first_acc, sett);
    const st_hash = st.hash();
    const st_root: Root = {
      acc: fr_serialize(st.accounts.root()),
      data: fr_serialize(st.files.root()),
    };

    // ===== Account transactions =====

    // Transcation #1: master 10 tokens → user-1
    const rec1_sk = "receiver password";
    let nonce1 = 0n;
    const rec1_pk = derivePublicKey(rec1_sk);
    const tx_sign1 = await prep_account_tx(10n, 0, 1, sk, rec1_pk[0], nonce++);
    const txex1 = await st.build_account_txex(tx_sign1);

    // Transcation #2: user-1 10 tokens → user-2
    const rec2_sk = "receiver password";
    let nonce2 = 0n;
    const rec2_pk = derivePublicKey(rec2_sk);
    const tx_sign2 = await prep_account_tx(10n, 1, 2, rec1_sk, rec2_pk[0], nonce1++);
    const txex2 = await st.build_account_txex(tx_sign2);

    // Transcation #3: master 228 tokens → user-2
    const tx_sign3 = await prep_account_tx(228n, 0, 2, sk, rec2_pk[0], nonce++);
    const txex3 = await st.build_account_txex(tx_sign3);

    // Collect account transactions into one array
    const acc_txs = pad_array([txex1, txex2, txex3], sett.account_tx_per_block, blank_account_tx(sett));

    // ===== File transactions =====

    const now = 0n;

    // File Transcation #1: master creates a file #0 with all 5s
    const fives: Tree<Fr> = Tree.init(
      sett.file_tree_depth,
      pad_array([], 1 << sett.file_tree_depth, BigInt(5)),
      id
    );
    const ftx1 = await prep_file_tx(10n, 0, 0, fives.root(), sk, nonce++);
    const ftxex1 = await st.build_file_txex(now, fives, ftx1);

    // File Transcation #2: user-2 adds another file #1 that contains sequence of numbers 0, 1, …
    const count_file: Tree<Fr> = await Tree.init(
      sett.file_tree_depth,
      Array.from(
        { length: 1 << sett.file_tree_depth },
        (_, i) => BigInt(i),
      ),
      id
    );
    const ftx2 = await prep_file_tx(100n, 2, 1, count_file.root(), rec2_sk, nonce2++);
    const ftxex2 = await st.build_file_txex(now, count_file, ftx2);

    // Collect file transactions
    const file_txs = pad_array([ftxex1, ftxex2], sett.file_tx_per_block, blank_file_tx(sett));

    // ===== Mining transactions =====

    let ro_offset= 0n;
    const ro_values = Array.from({length: sett.oracle_len}, (_, index) => BigInt(index));
    const file_reader = (file_id: bigint, word_id: bigint): Fr => {
      const [_f_prf, f] = st.files.readLeaf(Number(file_id));
      const [_w_prf, w] = f.data.readLeaf(Number(word_id));
      return w;
    };

    // Mining Transcation #1, user-2 mines
    const ro_off1 = ro_values.length - 2; // just as example
    const ro_val1 = ro_values[ro_off1];
    const mres1 = await mine(sett, rec2_pk[0], ro_val1, file_reader);
    const mtx1 = await prep_mining_tx(2, mres1, rec2_sk, nonce2++, ro_offset + BigInt(ro_off1));
    const mtxex1 = await st.build_mining_txex(mres1, mtx1);

    // // Mining Transcation #2, (new) master mines
    // // const rec4_sk = "user-4 password";
    // // const rec4_pk = derivePublicKey(rec4_sk);
    // // let nonce4 = 0n;
    // const ro_off2 = 1;
    // const ro_val2 = ro_values[ro_off2];
    // const mres2 = await mine(sett, pk[0], ro_val2, file_reader);
    // const mtx2 = await prep_mining_tx(0, mres2, sk, nonce++, ro_offset + BigInt(ro_off2));
    // const mtxex2 = await st.build_mining_txex(mres2, mtx2);

    // const mining_txs = pad_array([mtxex1], sett.mining_tx_per_block, blank_mining_tx(sett));
    const mining_txs = [mtxex1];

    // Compute the new hash
    const new_st_root: Root = {
      acc: fr_serialize(await st.accounts.root()),
      data: fr_serialize(await st.files.root()),
    };
    const new_st_hash = await st.hash();

    // Public input known to contract
    const pubInput: RollupPubInput = {
      old_root: fr_serialize(st_hash),
      new_root: fr_serialize(new_st_hash),
      now: now.toString(),
      oracle: {
        offset: ro_offset.toString(),
        data: ro_values.map((x) => x.toString()),
      },
    };
    const pubInputHash = pub_input_hash(sett, pubInput).toString();

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

  }, 10 * 60 * 1000); // 10 minutes

  test('Run blank transactions on genesis state', async () => {
    const sett = defShardedStorageSettings;

    const sk = "mypassword";
    const pk = derivePublicKey(sk);

    let first_acc = new Account();

    first_acc.key = pk[0];
    first_acc.balance = bigIntToFr(1000000n);
    first_acc.nonce = 0n;
    first_acc.random_oracle_nonce = 0n;

    let st = await State.genesisState(first_acc, sett);
    const st_hash = await st.hash();
    const st_root: Root = {
      acc: fr_serialize(await st.accounts.root()),
      data: fr_serialize(await st.files.root()),
    };

    const pubInput: RollupPubInput = {
      old_root: fr_serialize(st_hash),
      new_root: fr_serialize(st_hash),
      now: "0",
      oracle: {
        offset: "0",
        data: new Array(sett.oracle_len).fill("0"),
      },
    };
    const pubInputHash = pub_input_hash(sett, pubInput).toString();

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
  }, 10 * 60 * 1000); // 10 minutes

});
