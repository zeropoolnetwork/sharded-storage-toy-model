import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';
import { FileStorage } from './file-storage';
import { NODE_SK, SEQUENCER_URL } from './env';
import { derivePublicKey } from '@zk-kit/eddsa-poseidon';
import { SequencerClient } from 'zpst-common/src/api';

export interface AccountData {
  index: bigint;
  balance: bigint;
  nonce: bigint;
  random_oracle_nonce: bigint;
}

export class AppState {
  storage: FileStorage;
  /** This node's account data */
  accountData: AccountData;
  sequencer: SequencerClient;
  nodePk: bigint = derivePublicKey(NODE_SK)[0];

  constructor(storage: FileStorage, accountData: AccountData, sequencer: SequencerClient) {
    this.storage = storage;
    this.accountData = accountData;
    this.sequencer = sequencer;
  }
}

export let appState: AppState;

export async function init(accountData: AccountData) {
  const storage = await FileStorage.new(
    1 << defShardedStorageSettings.file_tree_depth,
    './data/segments',
  );

  const sequencer = new SequencerClient(SEQUENCER_URL);

  appState = new AppState(storage, accountData, sequencer);
}
