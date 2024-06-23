import fs from 'fs/promises';

import { Tree } from 'zpst-crypto-sdk/src/merkle-tree';
import { bigIntToFr, frAdd, Fr, fr_serialize, pub_input_hash, pad_array, prep_account_tx, prep_file_tx, prep_mining_tx } from 'zpst-crypto-sdk/src/util';
import { Account, File, State, blank_account_tx, blank_file_contents, blank_file_tx, new_account_tx } from 'zpst-crypto-sdk/src/state';
import { ShardedStorageSettings, defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';
import { blank_mining_tx, mine } from 'zpst-crypto-sdk/src/mining';
import { RandomOracle, Field, RollupInput, RollupPubInput, Root, circuits, circuits_circuit, AccountTx, AccountTxEx, SignaturePacked, FileTx, MiningTx } from 'zpst-crypto-sdk/src/noir_codegen';
import { derivePublicKey } from '@zk-kit/eddsa-poseidon';
import { prove, verify, ProverToml, VerifierToml } from 'zpst-crypto-sdk/src/nargo-wrapper'

import { MASTER_SK, GENESIS_BALANCE, BLOCK_TIME_INTERVAL, FILE_TREE_PATH, ACCOUNT_TREE_PATH, BLOCKS_PATH, MOCK_BLOCKCHAIN, ACCOUNTS_PATH, FILE_METADATA_PATH } from './env';
import { Blocks } from './blocks';
import { Level } from 'level';
import { RollupContract } from './contract';
import { uploadAndMine } from './nodes';

const ssConfig = defShardedStorageSettings;
export let appState: AppState;

export interface FileData {
  data: Buffer;
  metadata: FileMetadata,
}

export interface FileMetadata {
  path: string;
  size: number;
}

export interface AccountData {
  index: bigint;
  balance: Fr;
  nonce: bigint;
  random_oracle_nonce: bigint;
}

export class AppState {
  contract: RollupContract = null!;
  // TODO: Replace naive global state with redis or some other queue (rabbitmq, kafka, etc.)
  //       Redis would probaly be the best choice since we can use it as a cache as well.
  pendingAccounts: [AccountTx, SignaturePacked][] = [];
  pendingFiles: { tx: [FileTx, SignaturePacked], data: FileData }[] = [];
  state: State = null!;
  blocks: Blocks = null!;
  // Public key of the master account for convenience.
  masterPk: Fr = null!;
  // Account cache (user public key -> account data)
  accounts: Level<string, AccountData> = null!;
  // File metadata cache
  // TODO: Save metadata to storage.
  fileMetadata: Level<string, FileMetadata> = null!;

  private constructor() { }

  static async init(): Promise<AppState> {
    const self = new AppState();

    self.contract = await RollupContract.init();

    self.accounts = new Level(ACCOUNTS_PATH, { valueEncoding: 'json' });
    self.fileMetadata = new Level(FILE_METADATA_PATH, { valueEncoding: 'json' });

    self.blocks = await Blocks.new(BLOCKS_PATH);
    self.masterPk = derivePublicKey(MASTER_SK)[0];

    if (!checkFileExists(FILE_TREE_PATH) || !checkFileExists(ACCOUNT_TREE_PATH)) {
      // TODO: Proper state recovery. For now, we just assume that there was no prior state.
      console.log('No state found, creating new state...');

      let firstAcc = new Account();
      firstAcc.key = self.masterPk;
      firstAcc.balance = bigIntToFr(GENESIS_BALANCE);
      firstAcc.nonce = 0n;
      firstAcc.random_oracle_nonce = 0n;

      self.state = State.genesisState(firstAcc, ssConfig);

      // TODO: Send the initial transaction to the blockchain?

      await self.saveState();
    } else {
      console.log('State found, loading...');
      const accTreeData = await fs.readFile(ACCOUNT_TREE_PATH);
      const fileTreeData = await fs.readFile(FILE_TREE_PATH);
      const accTree = new Tree(ssConfig.acc_data_tree_depth, [], [], (acc: Account) => acc.hash());
      accTree.deserialize(accTreeData, () => new Account);
      const fileTree = new Tree(ssConfig.acc_data_tree_depth, [], [], (file: File) => file.hash());
      fileTree.deserialize(fileTreeData, () => new File);

      self.state = new State(accTree, fileTree);
    }

    return self;
  }

  async randomOracle(): Promise<[bigint, bigint[]]> {
    const roValues = await this.contract.getRandomOracleValues(ssConfig.oracle_len);
    // FIXME: Take random oracle from the blockchain and memoize it
    return [0n, roValues];
  }

  async addAccountTransaction(account: AccountTx, signature: SignaturePacked) {
    this.pendingAccounts.push([account, signature]);
  }

  async addFileTransaction(file: FileTx, signature: SignaturePacked, data: FileData) {
    this.pendingFiles.push({ tx: [file, signature], data });
  }

  async startSequencer() {
    console.log('Waiting for transactions...');
    while (true) {
      if (this.pendingAccounts.length === 0 && this.pendingFiles.length === 0) continue;

      console.log('Found transactions, batching...');
      const accounts = this.pendingAccounts.slice(0, ssConfig.account_tx_per_block);
      const files = this.pendingFiles.slice(0, ssConfig.file_tx_per_block);
      this.pendingAccounts = this.pendingAccounts.slice(ssConfig.account_tx_per_block);
      this.pendingFiles = this.pendingFiles.slice(ssConfig.file_tx_per_block);

      try {
        await this.batchTransactions(BigInt(this.contract.latestBlockNumber), accounts, files);
      } catch (err) {
        console.log('Failed to create a block:', err, 'Discarding transactions...');
      }

      await this.saveState();

      await new Promise(resolve => setTimeout(resolve, BLOCK_TIME_INTERVAL));
    }
  }

  private async batchTransactions(
    now: bigint,
    accounts: [AccountTx, SignaturePacked][],
    files: { tx: [FileTx, SignaturePacked], data: FileData }[],
  ): Promise<void> {
    const state = this.state.clone();

    const stateHash = state.hash();
    const stateRoot: Root = {
      acc: fr_serialize(state.accounts.root()),
      data: fr_serialize(state.files.root()),
    };

    const accTxs = await Promise.all(accounts.map(acc => state.build_account_txex(acc)));
    const fileTxs = await Promise.all(files.map(async file => {
      const hash = BigInt(file.tx[0].data); // FIXME: Is this correct or do I need to calculate the hash?
      return await state.build_file_txex(now, hash, file.tx)
    }));

    const accTxsPadded = pad_array(accTxs, ssConfig.account_tx_per_block, blank_account_tx(ssConfig));
    const fileTxsPadded = pad_array(fileTxs, ssConfig.file_tx_per_block, blank_file_tx(ssConfig));

    // TODO: Upload to nodes. Or let the user handle it? If so, how do we sync?

    // TODO: Challenge nodes
    const [roOffset, roValues] = await this.randomOracle();


    // TODO: Support mulitple mining txs
    const mining = await uploadAndMine(files.map(f => ({ id: f.tx[0].data_index, data: f.data.data })), roValues, roOffset);
    const miningTx = await state.build_mining_txex(mining.miningRes, mining.word, mining.tx);
    const miningTxs = [miningTx];

    // Generate a proof
    const newStateRoot: Root = {
      acc: fr_serialize(state.accounts.root()),
      data: fr_serialize(state.files.root()),
    };
    const newStateHash = state.hash();

    const pubInput: RollupPubInput = {
      old_root: fr_serialize(stateHash),
      new_root: fr_serialize(newStateHash),
      now: now.toString(),
      oracle: {
        offset: roOffset.toString(),
        data: roValues.map((x) => x.toString()),
      },
    };
    const pubInputHash = pub_input_hash(ssConfig, pubInput).toString();

    let input: RollupInput = {
      public: pubInput,
      tx: {
        txs: accTxsPadded,
      },
      file: {
        txs: fileTxsPadded,
      },
      mining: {
        txs: miningTxs,
      },
      old_root: stateRoot,
      new_root: newStateRoot,
    };

    const proverData: ProverToml = {
      pubhash: pubInputHash,
      input: input
    };

    const proof = prove('../circuits/', proverData);

    const verifierData: VerifierToml = {
      pubhash: pubInputHash,
    };

    if (!verify('../circuits/', verifierData, proof)) {
      throw new Error('Proof verification failed');
    }

    if (!MOCK_BLOCKCHAIN) {
      await this.contract.publishBlock(newStateHash, now, proof);
    } else {
      console.log('Blockchain is mocked, not submitting to contract.');
    }

    this.state = state;
  }

  private async saveState() {
    await fs.writeFile(ACCOUNT_TREE_PATH, this.state.accounts.serialize());
    await fs.writeFile(FILE_TREE_PATH, this.state.files.serialize());
  }
}

export async function initAppState() {
  appState = await AppState.init();
  appState.startSequencer();
}

async function checkFileExists(path: string) {
  try {
    await fs.access(path, fs.constants.F_OK);
  } catch (e) {
    return false;
  }
  return true;
}


