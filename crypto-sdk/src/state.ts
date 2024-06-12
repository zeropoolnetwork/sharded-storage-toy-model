import { Barretenberg, Fr } from "@aztec/bb.js";
import { MerkleProof, Tree, proof_to_noir } from "./merkle-tree"; 
import { FrHashed, Hashable, frSub, frToBigInt, frToNoir, noirToFr } from "./util"; 
import { ShardedStorageSettings } from "./settings";
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
  FileTxAssets
} from "./noir_codegen/index";

import { EdDSAPoseidon } from "@zk-kit/eddsa-poseidon";

export class Account implements Hashable {
  /// x coordinate of the owner account public key
  key: Fr;
  /// Balance
  balance: Fr;
  // Nonce
  nonce: Fr;
  // Mining nonce
  random_oracle_nonce: Fr;

  constructor() {
    this.key = Fr.ZERO;
    this.balance = Fr.ZERO;
    this.nonce = Fr.ZERO;
    this.random_oracle_nonce = Fr.ZERO;
  }

  async hash(bb: Barretenberg): Promise<Fr> {
    let to_hash: [Fr, Fr, Fr, Fr];
    if (this.key == Fr.ZERO) {
        // Hash zero account
        to_hash = [Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO];
    } else {
        to_hash = [this.key, this.balance, this.nonce, this.random_oracle_nonce];
    }
    return bb.poseidon2Hash(to_hash);
  }
};

export function accountToNoir(acc: Account): NoirAccount {
  return {
    key: frToNoir(acc.key),
    balance: frToNoir(acc.balance),
    nonce: frToNoir(acc.nonce),
    random_oracle_nonce: frToNoir(acc.random_oracle_nonce),
  } as NoirAccount;
}

export class File implements Hashable {
  expiration_time: Fr;
  // Owner account pk
  owner: Fr;
  // File contents serialized as a list of Fr. Null when file is not initialized
  data: Tree<FrHashed>;

  constructor(expiration_time: Fr, owner: Fr, data: Tree<FrHashed>) {
    this.expiration_time = expiration_time;
    this.owner = owner;
    this.data = data;
  }

  static async blank(bb: Barretenberg, d: number): Promise<File> {
    const data = await Tree.init(bb, d, new Array(1 << d).fill(new FrHashed(Fr.ZERO)));
    return new File(Fr.ZERO, Fr.ZERO, data);
  }

  async hash(bb: Barretenberg): Promise<Fr> {
    let to_hash: [Fr, Fr, Fr];
    if (this.data == null) {
        // Hash empty file
        to_hash = [Fr.ZERO, Fr.ZERO, Fr.ZERO];
    } else {
        to_hash = [this.expiration_time, this.owner, await this.data.hash(bb)];
    }
    return bb.poseidon2Hash(to_hash);
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

export async function new_account_tx(
  bb: Barretenberg,
  sender_index: number,
  sender_sk: EdDSAPoseidon,
  receiver_index: number,
  receiver_pk: Fr,
  amount: Fr
): Promise<[AccountTx, SignaturePacked]> {
  const tx: AccountTx = {
    sender_index: sender_index.toString(),
    receiver_index: receiver_index.toString(),
    receiver_key: frToNoir(receiver_pk),
    amount: frToNoir(amount),
    nonce: frToNoir(Fr.random()),
  };
  const hash = await bb.poseidon2Hash(
    [tx.sender_index, tx.receiver_index, tx.receiver_key, tx.amount, tx.nonce]
      .map(noirToFr)
  );
  const signature = sender_sk.signMessage(frToBigInt(hash));
  const packed = {
    a: sender_sk.publicKey[0].toString(),
    s: signature.S.toString(),
    r8: signature.R8[0].toString(),
  } as SignaturePacked;
  return [tx, packed];
}


export class State implements Hashable {
  accounts: Tree<Account>;
  files: Tree<File>;

  constructor(accounts: Tree<Account>, files: Tree<File>) {
    this.accounts = accounts;
    this.files = files;
  }

  static async genesisState(bb: Barretenberg, first_acc: Account, sett: ShardedStorageSettings): Promise<State> {
    let accs = new Array(1 << sett.acc_data_tree_depth).fill(new Account());
    accs[0] = first_acc;
    const accounts = await Tree.init(
      bb,
      sett.acc_data_tree_depth,
      accs,
    );
    const files = await Tree.init(
      bb,
      sett.acc_data_tree_depth,
      new Array(1 << sett.acc_data_tree_depth).fill(await File.blank(bb, sett.file_tree_depth))
    );
    return new State(accounts, files);
  }

  async build_account_tx_assets(tx: AccountTx, signature: SignaturePacked): Promise<AccountTxAssets> {
    const [sender_prf, sender] = this.accounts.readLeaf(Number(tx.sender_index));
    const [receiver_prf, receiver] = this.accounts.readLeaf(Number(tx.receiver_index));

    let acc = new Account();
    acc.key = noirToFr(tx.receiver_key);
    acc.balance = noirToFr(tx.amount);
    acc.nonce = noirToFr(tx.nonce);
    acc.random_oracle_nonce = Fr.ZERO;
    await this.accounts.updateLeaf(Number(tx.receiver_index), acc);
    // TODO: double-check if TS is not doing anything weird with copying sender_mod here
    let sender_mod = sender;
    sender_mod.balance = frSub(
      sender.balance,
      noirToFr(tx.amount)
    );
    if (frToBigInt(sender.balance) == 0n)
      sender_mod.key = Fr.ZERO;
    await this.accounts.updateLeaf(Number(tx.sender_index), sender_mod);

    return {
      proof_sender: proof_to_noir(sender_prf),
      proof_receiver: proof_to_noir(receiver_prf),
      account_sender: accountToNoir(sender),
      account_receiver: accountToNoir(receiver),
      signature: signature,
    };
  }

  async hash(bb: Barretenberg): Promise<Fr> {
    return bb.poseidon2Hash([
      await this.accounts.hash(bb),
      await this.files.hash(bb),
    ]);
  }

}
