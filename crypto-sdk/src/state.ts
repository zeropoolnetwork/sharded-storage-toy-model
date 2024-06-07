import { Barretenberg, Fr } from "@aztec/bb.js";
import { MerkleProof, Tree, proof_to_noir } from "./merkle-tree.js"; 
import { FrHashed, Hashable, frToBigInt, frToNoir, noirToFr } from "./util.js"; 
import { ShardedStorageSettings } from "./settings.js";
import { Field as NoirFr, Account as NoirAccount, AccountTx, AccountTxAssets, SignaturePacked } from "./noir_codegen/index.js";

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
    if (this.key == Fr.ZERO) {
        // Hash zero account
        return bb.poseidon2Hash([Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO]);
    } else {
        return bb.poseidon2Hash([this.key, this.balance, this.nonce, this.random_oracle_nonce]);
    }
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
  data: null | Tree<FrHashed>;

  constructor() {
    this.expiration_time = Fr.ZERO;
    this.owner = Fr.ZERO;
    this.data = null;
  }

  async hash(bb: Barretenberg): Promise<Fr> {
    if (this.data == null) {
        // Hash empty file
        return bb.poseidon2Hash([Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO]);
    } else {
        return bb.poseidon2Hash([this.expiration_time, this.owner, await this.data.hash(bb)]);
    }
  }
};

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


export class State {
  accounts: Tree<Account>;
  files: Tree<File>;

  constructor(x: never) {
    this.accounts = x;
    this.files = x;
  }

  static async genesisState(bb: Barretenberg, sett: ShardedStorageSettings): Promise<State> {
    return {
      accounts: await Tree.init(
        bb,
        sett.acc_data_tree_depth,
        new Array(1 << sett.acc_data_tree_depth).fill(new Account())
      ),
      files: await Tree.init(
        bb,
        sett.acc_data_tree_depth,
        new Array(1 << sett.acc_data_tree_depth).fill(new File())
      ),
    } as State;
  }

  async build_account_assets(tx: AccountTx, signature: SignaturePacked): Promise<AccountTxAssets> {
    const [sender_prf, sender] = this.accounts.readLeaf(Number(tx.sender_index));
    const [receiver_prf, receiver] = this.accounts.readLeaf(Number(tx.receiver_index));

    this.accounts.updateLeaf(Number(tx.receiver_index),
      {
        key: noirToFr(tx.receiver_key),
        balance: noirToFr(tx.amount),
        nonce: noirToFr(tx.nonce),
        random_oracle_nonce: Fr.ZERO,
      } as Account
    );

    return {
      proof_sender: proof_to_noir(sender_prf),
      proof_receiver: proof_to_noir(receiver_prf),
      account_sender: accountToNoir(sender),
      account_receiver: accountToNoir(receiver),
      signature: signature,
    } as AccountTxAssets;
  }

}
