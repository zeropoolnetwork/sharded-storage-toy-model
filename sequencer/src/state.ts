import fs from 'fs/promises';

import { Tree } from 'zpst-crypto-sdk/lib/merkle-tree';
import { bigIntToFr, frAdd, Fr, fr_serialize, pub_input_hash, pad_array, prep_account_tx, prep_file_tx, prep_mining_tx, pack_tx } from 'zpst-crypto-sdk/lib/util';
import { Account, File, State, blank_account_tx, blank_file_contents, blank_file_tx, new_account_tx } from 'zpst-crypto-sdk/lib/state';
import { ShardedStorageSettings, defShardedStorageSettings } from 'zpst-crypto-sdk/lib/settings';
import { blank_mining_tx, mine } from 'zpst-crypto-sdk/lib/mining';
import { RandomOracle, Field, RollupInput, RollupPubInput, Root, circuits, circuits_circuit, AccountTx, AccountTxEx, SignaturePacked, FileTx, MiningTx, FileTxEx } from 'zpst-crypto-sdk/lib/noir_codegen';
import { derivePublicKey } from '@zk-kit/eddsa-poseidon';
import { prove, verify, ProverToml, VerifierToml } from 'zpst-crypto-sdk/lib/nargo-wrapper'

import { MASTER_SK, GENESIS_BALANCE, BLOCK_TIME_INTERVAL, MOCK_BLOCKCHAIN } from './env';
import { Blocks } from './blocks';
import { Level } from 'level';
import { IRollupContract, RollupContract, RollupContractMock } from './contract';
import { upload, uploadAndMine } from './nodes';

const FILES_TREE_PATH = './data/files_tree.bin';
const ACCOUNT_TREE_PATH = './data/account_tree.bin';
const ACCOUNTS_PATH = './data/accounts';
const FILE_METADATA_PATH = './data/file_metadata';
const DEFAULT_DURATION = 7149n * 10n; // ~10 days


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

interface FileMetadataEx extends FileMetadata {
  expiration_time: bigint;
}

export interface AccountData {
  index: bigint;
  balance: Fr;
  nonce: bigint;
  random_oracle_nonce: bigint;
}

export class AppState {
  contract: IRollupContract = null!;
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
  fileMetadata: Level<string, FileMetadataEx> = null!;

  // FIXME: temporary
  counters: Level<string, number> = null!;

  private constructor() { }

  static async init(): Promise<AppState> {
    const self = new AppState();

    if (MOCK_BLOCKCHAIN) {
      self.contract = new RollupContractMock();
    } else {
      self.contract = await RollupContract.init();
    }

    self.accounts = new Level(ACCOUNTS_PATH, { valueEncoding: 'json' });
    self.fileMetadata = new Level(FILE_METADATA_PATH, { valueEncoding: 'json' });
    self.counters = new Level('./data/counters');

    self.blocks = await Blocks.new('./data/blocks');
    self.masterPk = derivePublicKey(MASTER_SK)[0];


    if (!checkFileExists(FILES_TREE_PATH) || !checkFileExists(ACCOUNT_TREE_PATH)) {
      // TODO: Proper state recovery. For now, we just assume that there was no prior state.
      console.log('No state found, creating new state...');

      let firstAcc = new Account();
      firstAcc.key = self.masterPk;
      firstAcc.balance = bigIntToFr(GENESIS_BALANCE);
      firstAcc.nonce = 0n;
      firstAcc.random_oracle_nonce = 0n;

      self.state = State.genesisState(firstAcc, ssConfig);

      await self.saveState();
    } else {
      console.log('State found, loading...');
      const accTreeData = await fs.readFile(ACCOUNT_TREE_PATH);
      const fileTreeData = await fs.readFile(FILES_TREE_PATH);
      const accTree = new Tree(ssConfig.acc_data_tree_depth, [], [], (acc: Account) => acc.hash());
      accTree.deserialize(accTreeData, () => new Account);
      const fileTree = new Tree(ssConfig.acc_data_tree_depth, [], [], (file: File) => file.hash());
      fileTree.deserialize(fileTreeData, () => new File);

      self.state = new State(accTree, fileTree);
    }

    return self;
  }

  async randomOracle(): Promise<[bigint, bigint[]]> {
    return await this.contract.getRandomOracleValues(ssConfig.oracle_len);
  }

  async addAccountTransaction(account: AccountTx, signature: SignaturePacked) {
    this.pendingAccounts.push([account, signature]);
  }

  async addFileTransaction(file: FileTx, signature: SignaturePacked, data: FileData) {
    this.pendingFiles.push({ tx: [file, signature], data });
  }

  // FIXME: quick and dirty id/index allocation
  async getVacantIndices(): Promise<{ vacantFileIndex: number, vacantAccountIndex: number }> {
    let fileIndex = 0;
    let accountIndex = 0;

    try {
      fileIndex = await this.counters.get('file_index');
    } catch (e) {
      // Do nothing
    }

    try {
      accountIndex = await this.counters.get('account_index');
    } catch (e) {
      // Do nothing
    }

    return {
      vacantFileIndex: fileIndex,
      vacantAccountIndex: accountIndex,
    };
  }

  async startSequencer() {
    console.log('Waiting for transactions...');
    while (true) {
      if (this.pendingAccounts.length === 0 && this.pendingFiles.length === 0) {
        await new Promise(resolve => setTimeout(resolve, BLOCK_TIME_INTERVAL));;
      }

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
    }
  }

  private async batchTransactions(
    now: bigint,
    accounts: [AccountTx, SignaturePacked][],
    files: { tx: [FileTx, SignaturePacked], data: FileData }[],
  ): Promise<void> {
    const st = this.state.clone();

    const stateHash = st.hash();
    const stateRoot: Root = {
      acc: fr_serialize(st.accounts.root()),
      data: fr_serialize(st.files.root()),
    };

    const accTxs = accounts.map(acc => st.build_account_txex(acc));
    const accTxsPadded = pad_array(accTxs, ssConfig.account_tx_per_block, blank_account_tx(ssConfig));

    const [roOffset, roValues] = await this.randomOracle();
    // TODO: Support mulitple mining txs
    const mining = await uploadAndMine(files.map(f => ({ id: f.tx[0].data_index, data: f.data.data })), roValues, roOffset);
    const miningTx = st.build_mining_txex(mining.miningRes, mining.word, mining.tx);
    const miningTxs = [miningTx];

    const fileTxs = files.map(file => {
      const hash = BigInt(file.tx[0].data); // FIXME: Is this correct or do I need to calculate the hash?
      return st.build_file_txex(now, hash, file.tx)
    });
    const fileTxsPaddedIncomplete = pad_array(fileTxs, ssConfig.file_tx_per_block - 1, blank_file_tx(ssConfig));

    // Create the special 0th file tx that saves all of txes we've seen so far into ShardedStorage
    const masterAccount: AccountData = await this.accounts.get(this.masterPk.toString()); // Can't fail
    const metaFileIndex = (1 << ssConfig.acc_data_tree_depth) - 1; // FIXME: apply offset
    const metaFileDuration = 7149n * 10n; // ~10 days
    const metaFileSender = 0;
    const metaFileTx: FileTx = {
      sender_index: metaFileSender.toString(),
      data_index: metaFileIndex.toString(),
      time_interval: fr_serialize(metaFileDuration),
      data: undefined as never, // FIXME: Meta tx data
      nonce: undefined as never,
    };
    const metaTxData = Tree.init(
      ssConfig.file_tree_depth,
      pad_array(
        pack_tx(
          accTxs.map((x) => x.tx),
          miningTxs.map((x) => x.tx),
          [...fileTxsPaddedIncomplete.map((x) => x.tx), metaFileTx],
        ),
        1 << ssConfig.file_tree_depth,
        0n,
      ),
      (x) => x,
    );
    const ftx_self = prep_file_tx(
      metaFileDuration,
      metaFileSender,
      metaFileIndex,
      metaTxData.root(),
      MASTER_SK,
      masterAccount.nonce++
    );
    const ftxex_self = st.build_file_txex(now, metaTxData.root(), ftx_self);
    const fileTxsPadded = [...fileTxsPaddedIncomplete, ftxex_self];

    // Generate a proof
    const newStateRoot: Root = {
      acc: fr_serialize(st.accounts.root()),
      data: fr_serialize(st.files.root()),
    };
    const newStateHash = st.hash();

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

    await this.contract.publishBlock(newStateHash, now, proof);

    // Upload the meta file to storage nodes
    await upload(files.slice(files.length - 1).map(f => ({ id: f.tx[0].data_index, data: f.data.data })));

    await Promise.all(files.map(f => {
      return this.fileMetadata.put(f.tx[0].data_index.toString(), {
        expiration_time: now + DEFAULT_DURATION,
        ...f.data.metadata,
      });
    }));

    this.state = st;
  }

  private async incrementIndices(accountsBy: number, filesBy: number) {
    try {
      const accIndex = await this.counters.get('account_index');
      await this.counters.put('account_index', accIndex + accountsBy);
    } catch (e) {
      await this.counters.put('account_index', accountsBy);
    }

    try {
      const fileIndex = await this.counters.get('file_index');
      await this.counters.put('file_index', fileIndex + filesBy);
    } catch (e) {
      await this.counters.put('file_index', filesBy);
    }
  }

  private async saveState() {
    await fs.writeFile(ACCOUNT_TREE_PATH, this.state.accounts.serialize());
    await fs.writeFile(FILES_TREE_PATH, this.state.files.serialize());
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


