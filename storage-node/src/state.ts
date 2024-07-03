import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';
import { FileStorage } from './file-storage';
import { NODE_SK, SEQUENCER_URL } from './env';
import { derivePublicKey } from '@zk-kit/eddsa-poseidon';
import { SequencerClient } from 'zpst-common/src/api';
import { Account } from 'zpst-crypto-sdk';

export class AppState {
  storage: FileStorage;
  /** This node's account data */
  accountData: Account;
  accountIndex: number;
  sequencer: SequencerClient;
  nodePk: bigint = derivePublicKey(NODE_SK)[0];

  constructor(storage: FileStorage, accountData: Account, accountIndex: number, sequencer: SequencerClient) {
    this.storage = storage;
    this.accountData = accountData;
    this.accountIndex = accountIndex;
    this.sequencer = sequencer;
  }
}

export let appState: AppState;

export async function init(accountData: Account, accountIndex: number) {
  const storage = await FileStorage.new(
    1 << defShardedStorageSettings.file_tree_depth,
    './data/segments',
  );

  const sequencer = new SequencerClient(SEQUENCER_URL);

  appState = new AppState(storage, accountData, accountIndex, sequencer);
}

