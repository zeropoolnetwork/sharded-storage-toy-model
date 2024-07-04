import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';
import { FileStorage } from './file-storage';
import { NODE_SK, SEQUENCER_URL } from './env';
import { derivePublicKey } from '@zk-kit/eddsa-poseidon';
import { AccountData, SequencerClient } from 'zpst-common/src/api';
import { Account } from 'zpst-crypto-sdk';

export class AppState {
  storage: FileStorage;
  /** This node's account data */
  accountData: AccountData;
  accountIndex: number;
  sequencer: SequencerClient;
  nodePk: bigint = derivePublicKey(NODE_SK)[0];

  constructor(storage: FileStorage, accountData: AccountData, accountIndex: number, sequencer: SequencerClient) {
    this.storage = storage;
    this.accountData = accountData;
    this.accountIndex = accountIndex;
    this.sequencer = sequencer;
  }

  async updateAccountData() {
    try {
      const res = await this.sequencer.getAccount(this.nodePk);
      console.log('Updated account data:', res);
      this.accountData = res.account;
      this.accountIndex = res.index;
    } catch (e) {
      console.warn('Failed to update account data:', e);
      this.accountData = {
        nonce: 0n.toString(),
        balance: 0n.toString(),
        key: NODE_SK,
        random_oracle_nonce: 0n.toString(),
      };
      this.accountIndex = 0;
    }
  }
}

export let appState: AppState;

export async function init(accountData?: AccountData, accountIndex?: number) {
  const storage = await FileStorage.new('./data/segments');
  const sequencer = new SequencerClient(SEQUENCER_URL);

  const vacantIndex = accountIndex || (await sequencer.getVacantIndices()).vacantAccountIndex;
  accountData = accountData || {
    nonce: 0n.toString(),
    balance: 0n.toString(),
    key: NODE_SK,
    random_oracle_nonce: 0n.toString(),
  };

  appState = new AppState(storage, accountData, vacantIndex, sequencer);
}

