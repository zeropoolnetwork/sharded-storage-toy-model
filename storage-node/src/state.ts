import { defShardedStorageSettings } from 'zpst-crypto-sdk/lib/settings';
import { FileStorage } from './file-storage';
import { NODE_SK } from './env';
import { derivePublicKey } from '@zk-kit/eddsa-poseidon';

export interface AccountData {
  index: bigint;
  balance: bigint;
  nonce: bigint;
  random_oracle_nonce: bigint;
}

// TODO: Wrap in a class

export let storage: FileStorage;
export let accountData: AccountData = {
  index: BigInt(0),
  balance: BigInt(0),
  nonce: BigInt(0),
  random_oracle_nonce: BigInt(0),
};
export let nodePk: bigint = derivePublicKey(NODE_SK)[0];

export async function init() {
  storage = await FileStorage.new(1 << defShardedStorageSettings.file_tree_depth, './data/segments');
}

export function updateAccountData(data: AccountData) {
  accountData = data;
}
