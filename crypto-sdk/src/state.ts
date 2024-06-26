import { MerkleProof, Tree, proof_to_noir } from "./merkle-tree";
import { Fr, bigIntToFr, frAdd, frSub, fr_serialize, fr_deserialize, Serde } from "./util";
import { ShardedStorageSettings, defShardedStorageSettings } from "./settings";
import {
  Field as NoirFr,
  Account as NoirAccount,
  File as NoirFile,
  MerkleProof as NoirMerkleProof,
  AccountTx,
  AccountTxAssets,
  SignaturePacked,
  AccountTxEx,
  FileTxEx,
  FileTx,
  FileTxAssets,
  MiningTx,
  MiningTxEx,
  MiningTxAssets
} from "./noir_codegen/index";

import { poseidon2_bn256_hash } from 'zpst-poseidon2-bn256'
import { BinaryWriter, BinaryReader } from 'zpst-common/src/binary';

import { EdDSAPoseidon } from "@zk-kit/eddsa-poseidon";
import { MiningResult } from "./mining";

export class Account implements Serde {
  /// x coordinate of the owner account public key
  key: Fr;
  /// Balance
  balance: Fr;
  // Nonce
  nonce: Fr;
  // Mining nonce
  random_oracle_nonce: Fr;

  constructor() {
    this.key = 0n;
    this.balance = 0n;
    this.nonce = 0n;
    this.random_oracle_nonce = 0n;
  }

  hash(): Fr {
    let to_hash: [Fr, Fr, Fr, Fr];
    if (this.key == 0n) {
      // Hash zero account
      to_hash = [0n, 0n, 0n, 0n];
    } else {
      to_hash = [this.key, this.balance, this.nonce, this.random_oracle_nonce];
    }
    return fr_deserialize(poseidon2_bn256_hash(to_hash.map(fr_serialize)));
  }

  serialize(): Buffer {
    const w = new BinaryWriter(32 * 4);
    w.writeU256(this.key);
    w.writeU256(this.balance);
    w.writeU256(this.nonce);
    w.writeU256(this.random_oracle_nonce);

    return w.toBuffer();
  }

  deserialize(buf: Buffer) {
    const r = new BinaryReader(buf);
    this.key = r.readU256();
    this.balance = r.readU256();
    this.nonce = r.readU256();
    this.random_oracle_nonce = r.readU256();
  }
};

export function fileToNoir(file: File): NoirFile {
  return {
    expiration_time: fr_serialize(file.expiration_time),
    locked: file.locked,
    owner: fr_serialize(file.owner),
    data: fr_serialize(file.data_hash),
  };
}

export function accountToNoir(acc: Account): NoirAccount {
  return {
    key: fr_serialize(acc.key),
    balance: fr_serialize(acc.balance),
    nonce: fr_serialize(acc.nonce),
    random_oracle_nonce: fr_serialize(acc.random_oracle_nonce),
  };
}

export function blank_file_contents(d: number): Tree<Fr> {
  return Tree.init(d, new Array(1 << d).fill(0n), (x) => x);
}

export class File implements Serde {
  expiration_time: Fr;
  locked: boolean;
  // Owner account pk
  owner: Fr;
  // Merkle hash of data
  data_hash: Fr;

  constructor();
  constructor(v: { expiration_time: Fr, locked: boolean, owner: Fr, data_hash: Fr });
  constructor(v?: { expiration_time: Fr, locked: boolean, owner: Fr, data_hash: Fr }) {
    this.expiration_time = v?.expiration_time ?? 0n;
    this.locked = v?.locked ?? false;
    this.owner = v?.owner ?? 0n;
    this.data_hash = v?.data_hash ?? 0n;
  }

  static blank(d: number): File {
    const data = blank_file_contents(d);
    return new File({
      expiration_time: 0n,
      locked: false,
      owner: 0n,
      data_hash: data.root(),
    });
  }

  hash(): Fr {
    return fr_deserialize(
      poseidon2_bn256_hash([
        this.expiration_time,
        this.locked ? 1n : 0n,
        this.owner,
        this.data_hash,
      ].map(fr_serialize))
    );
  }

  serialize(): Buffer {
    const w = new BinaryWriter(32 * 3);
    w.writeU256(this.expiration_time);
    w.writeU256(this.owner);
    w.writeU256(this.data_hash);

    return w.toBuffer();
  }

  deserialize(buf: Buffer) {
    const r = new BinaryReader(buf);
    this.expiration_time = r.readU256();
    this.owner = r.readU256();
    this.data_hash = r.readU256();
  }
};


export function blank_account_tx(sett: ShardedStorageSettings): AccountTxEx {
  const tx: AccountTx = {
    sender_index: "0",
    receiver_index: "0",
    receiver_key: "0",
    amount: "0",
    nonce: "0",
  };

  const dummy_proof: NoirMerkleProof = {
    index_bits: new Array(sett.acc_data_tree_depth).fill("0"),
    hash_path: new Array(sett.acc_data_tree_depth).fill("0"),
  };

  const dummy_account: NoirAccount = {
    key: "0",
    balance: "0",
    nonce: "0",
    random_oracle_nonce: "0",
  }

  const dummy_signature: SignaturePacked = {
    a: "0",
    s: "0",
    r8: "0",
  };

  const assets: AccountTxAssets = {
    proof_sender: dummy_proof,
    proof_receiver: dummy_proof,
    account_sender: dummy_account,
    account_receiver: dummy_account,
    signature: dummy_signature,
  };

  return { tx, assets };
}

export function blank_file_tx(sett: ShardedStorageSettings): FileTxEx {
  const tx: FileTx = {
    sender_index: "0",
    data_index: "0",
    time_interval: "0",
    data: "0",
    nonce: "0",
  };

  const dummy_proof: NoirMerkleProof = {
    index_bits: new Array(sett.acc_data_tree_depth).fill("0"),
    hash_path: new Array(sett.acc_data_tree_depth).fill("0"),
  };

  const dummy_account: NoirAccount = {
    key: "0",
    balance: "0",
    nonce: "0",
    random_oracle_nonce: "0",
  }

  const dummy_file: NoirFile = {
    expiration_time: "0",
    locked: false,
    owner: "0",
    data: "0",
  };

  const dummy_signature: SignaturePacked = {
    a: "0",
    s: "0",
    r8: "0",
  };

  const assets: FileTxAssets = {
    proof_sender: dummy_proof,
    proof_file: dummy_proof,
    account_sender: dummy_account,
    file: dummy_file,
    signature: dummy_signature,
  };

  return { tx, assets };
}

export function new_account_tx(
  sender_index: number,
  sender_sk: EdDSAPoseidon,
  receiver_index: number,
  receiver_pk: Fr,
  amount: Fr
): [AccountTx, SignaturePacked] {
  const tx: AccountTx = {
    sender_index: sender_index.toString(),
    receiver_index: receiver_index.toString(),
    receiver_key: fr_serialize(receiver_pk),
    amount: fr_serialize(amount),
    nonce: fr_serialize(0n),
  };
  const hash = poseidon2_bn256_hash(
    [tx.sender_index, tx.receiver_index, tx.receiver_key, tx.amount, tx.nonce]
  );
  const signature = sender_sk.signMessage(fr_deserialize(hash));
  const packed = {
    a: sender_sk.publicKey[0].toString(),
    s: signature.S.toString(),
    r8: signature.R8[0].toString(),
  } as SignaturePacked;
  return [tx, packed];
}


export class State {
  accounts: Tree<Account>;
  files: Tree<File>;

  constructor(accounts: Tree<Account>, files: Tree<File>) {
    this.accounts = accounts;
    this.files = files;
  }

  static genesisState(first_acc: Account, sett: ShardedStorageSettings): State {
    let accs = new Array(1 << sett.acc_data_tree_depth).fill(new Account());
    accs[0] = first_acc;
    const accounts = Tree.init(
      sett.acc_data_tree_depth,
      accs,
      (acc: Account) => acc.hash(),
    );
    const files = Tree.init(
      sett.acc_data_tree_depth,
      new Array(1 << sett.acc_data_tree_depth).fill(File.blank(sett.file_tree_depth)),
      (file: File) => file.hash(),
    );
    return new State(accounts, files);
  }

  build_account_txex([tx, signature]: [AccountTx, SignaturePacked]): AccountTxEx {

    // calculate proof for the sender and update tree
    const [sender_prf, sender] = this.accounts.readLeaf(Number(tx.sender_index));
    let sender_mod = new Account();
    sender_mod.balance = frSub(
      sender.balance,
      fr_deserialize(tx.amount)
    );
    if (sender_mod.balance == 0n) {
      sender_mod.nonce = 0n;
      sender_mod.random_oracle_nonce = 0n;
      sender_mod.key = 0n;
    } else {
      sender_mod.nonce = bigIntToFr(BigInt(tx.nonce) + 1n);
      sender_mod.random_oracle_nonce = sender.random_oracle_nonce;
      sender_mod.key = sender.key;
    }
    this.accounts.updateLeaf(Number(tx.sender_index), sender_mod);

    // calculate proof for the receiver and update proof
    const [receiver_prf, receiver] = this.accounts.readLeaf(Number(tx.receiver_index));
    let receiver_mod = new Account();
    receiver_mod.key = fr_deserialize(tx.receiver_key);
    receiver_mod.balance = frAdd(
      fr_deserialize(tx.amount),
      receiver.balance
    );
    receiver_mod.nonce = receiver.nonce;
    receiver_mod.random_oracle_nonce = receiver.random_oracle_nonce;
    this.accounts.updateLeaf(Number(tx.receiver_index), receiver_mod);

    const assets: AccountTxAssets = {
      proof_sender: proof_to_noir(sender_prf),
      proof_receiver: proof_to_noir(receiver_prf),
      account_sender: accountToNoir(sender),
      account_receiver: accountToNoir(receiver),
      signature: signature,
    };

    return {
      tx: tx,
      assets: assets
    }
  }

  build_file_txex(
    now: bigint,
    data_hash: Fr,
    [tx, signature]: [FileTx, SignaturePacked],
    /// Locked files can't be modified until they expire
    locked?: boolean,
  ): FileTxEx {

    const sett = defShardedStorageSettings;

    const fee = sett.storage_fee * BigInt(tx.time_interval);

    // calculate proof for the sender and update tree
    const [sender_prf, sender] = this.accounts.readLeaf(Number(tx.sender_index));
    let sender_mod = new Account();
    sender_mod.balance = frSub(
      sender.balance,
      fee
    );
    if (sender_mod.balance == 0n) {
      sender_mod.nonce = 0n;
      sender_mod.random_oracle_nonce = 0n;
      sender_mod.key = 0n;
    } else {
      sender_mod.nonce = bigIntToFr(BigInt(tx.nonce) + 1n);
      sender_mod.random_oracle_nonce = sender.random_oracle_nonce;
      sender_mod.key = sender.key;
    }
    this.accounts.updateLeaf(Number(tx.sender_index), sender_mod);

    // calculate proof for the receiver and update proof
    const [file_prf, file] = this.files.readLeaf(Number(tx.data_index));
    const exp_time = file.expiration_time;
    let file_mod = new File({
      expiration_time: bigIntToFr((now > exp_time ? now : exp_time) + BigInt(tx.time_interval)),
      locked: locked ?? false,
      owner: sender.key,
      data_hash: data_hash,
    });
    this.files.updateLeaf(Number(tx.data_index), file_mod);

    const assets: FileTxAssets = {
      proof_sender: proof_to_noir(sender_prf),
      proof_file: proof_to_noir(file_prf),
      account_sender: accountToNoir(sender),
      file: fileToNoir(file),
      signature: signature,
    };

    return {
      tx: tx,
      assets: assets
    }
  }

  build_mining_txex(
    mi: MiningResult,
    [proof_word, word]: [MerkleProof, Fr],
    [tx, signature]: [MiningTx, SignaturePacked],
  ): MiningTxEx {

    const sett = defShardedStorageSettings;

    // calculate proof for the sender and update tree
    const [sender_prf, sender] = this.accounts.readLeaf(Number(tx.sender_index));
    let sender_mod = new Account();
    sender_mod.balance = frAdd(
      sender.balance,
      sett.mining_reward
    );
    sender_mod.nonce = bigIntToFr(BigInt(tx.nonce) + 1n);
    sender_mod.random_oracle_nonce = fr_deserialize(tx.random_oracle_nonce);
    sender_mod.key = sender.key;
    this.accounts.updateLeaf(Number(tx.sender_index), sender_mod);

    const [proof_file, file] = this.files.readLeaf(Number(mi.file_in_storage_index));
    // const [proof_word, word] = file.data.readLeaf(Number(mi.word_in_file_index));

    const assets: MiningTxAssets = {
      proof_sender: proof_to_noir(sender_prf),
      account_sender: accountToNoir(sender),
      random_oracle_value: fr_serialize(mi.random_oracle_value),
      proof_file: proof_to_noir(proof_file),
      file: fileToNoir(file),
      proof_data_in_file: proof_to_noir(proof_word),
      data_in_file: fr_serialize(word),
      signature: signature,
    };

    return {
      tx: tx,
      assets: assets
    }
  }

  hash(): Fr {
    return fr_deserialize(poseidon2_bn256_hash([
      this.accounts.root(),
      this.files.root(),
    ].map(fr_serialize)));
  }

  clone(): State {
    return new State(this.accounts.clone(), this.files.clone());
  }
}
