import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';
import { FileStorage } from './file-storage';
import { NODE_SK, SEQUENCER_URL } from './env';
import { derivePublicKey } from '@zk-kit/eddsa-poseidon';
import { AccountData, SequencerClient } from 'zpst-common/src/api';
import { Account } from 'zpst-crypto-sdk';

export class AppState {
  storage: FileStorage;
  sequencer: SequencerClient;
  nodePk: bigint = derivePublicKey(NODE_SK)[0];

  constructor(storage: FileStorage, sequencer: SequencerClient) {
    this.storage = storage;
    this.sequencer = sequencer;
  }
}

export let appState: AppState;

export async function init() {
  const storage = await FileStorage.new('./data/segments');
  const sequencer = new SequencerClient(SEQUENCER_URL);

  appState = new AppState(storage, sequencer);
}

