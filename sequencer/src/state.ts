import fs from 'fs/promises';

import { Tree } from 'zpst-crypto-sdk/src/merkle-tree';
import {
  bigIntToFr,
  frAdd,
  Fr,
  fr_serialize,
  pub_input_hash,
  pad_array,
  prep_account_tx,
  prep_file_tx,
  prep_mining_tx,
  pack_tx,
  frSub,
} from 'zpst-crypto-sdk/src/util';
import {
  Account,
  File,
  State,
  blank_account_tx,
  blank_file_contents,
  blank_file_tx,
  new_account_tx,
} from 'zpst-crypto-sdk/src/state';
import {
  ShardedStorageSettings,
  defShardedStorageSettings,
} from 'zpst-crypto-sdk/src/settings';
import { blank_mining_tx } from 'zpst-crypto-sdk/src/mining';
import {
  RandomOracle,
  Field,
  RollupInput,
  RollupPubInput,
  Root,
  Account as AccountType,
  File as FileType,
  AccountTx,
  AccountTxEx,
  SignaturePacked,
  FileTx,
  MiningTx,
  FileTxEx,
  MerkleProof,
  MiningTxEx,
} from 'zpst-crypto-sdk/src/noir_codegen';
import { derivePublicKey } from '@zk-kit/eddsa-poseidon';
import {
  prove,
  verify,
  ProverToml,
} from 'zpst-crypto-sdk/src/nargo-wrapper';

import {
  MASTER_SK,
  GENESIS_BALANCE,
  BLOCK_TIME_INTERVAL,
  MOCK_BLOCKCHAIN,
  MINING_INTERVAL,
} from './env';
import { Blocks } from './blocks';
import { Level } from 'level';
import {
  IRollupContract,
  RollupContract,
  RollupContractMock,
} from './contract';
import { upload, broadcastMiningChallenge, UploadAndMineResponse, isAnyNodeConnected } from './nodes';
import { BinaryReader, BinaryWriter } from 'zpst-common/src/binary';
import { encodeFile, bufferToFrElements } from 'zpst-common/src/codec';
import { brotliCompress, brotliDecompress } from 'node:zlib';
import { promisify } from 'node:util';

// const deflateAsync = promisify(deflate);
// const unzipAsync = promisify(unzip)
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

const FILES_TREE_PATH = './data/files_tree.bin';
const ACCOUNT_TREE_PATH = './data/account_tree.bin';
const ACCOUNTS_PATH = './data/accounts';
const FILE_METADATA_PATH = './data/file_metadata';
const BLOCKS_PATH = './data/blocks';

const ssConfig = defShardedStorageSettings;
export let appState: AppState;

export interface FileData {
  data: Buffer;
  fileMetadata: FileMetadata;
}

export interface FileMetadata {
  hash: bigint
  path: string;
  size: number;
}

type PendingSegment = { tx: [FileTx, SignaturePacked]; data: Buffer, order: number, fileMetadata: FileMetadata };

// TODO: It would be enough to just provide a pk => index mapping.
class AccountCache {
  accounts: Level<bigint, { index: number, account: Account }> = null!;

  constructor() {
    this.accounts = new Level(ACCOUNTS_PATH, {
      valueEncoding: 'json',
    });
  }

  async get(pk: bigint): Promise<{ index: number, account: Account } | null> {
    try {
      return await this.accounts.get(pk);
    } catch (e) {
      return null;
    }
  }

  async put(pk: bigint, account: { index: number, account: Account }) {
    await this.accounts.put(pk, account);
  }
}

class OptimisticState {
  accounts: Map<number, Account> = new Map();
  accountIndices: Map<bigint, number> = new Map();
  files: Map<number, File> = new Map();

  accountTxs: [AccountTx, SignaturePacked][] = [];
  fileTxs: PendingSegment[] = [];
  mineTxs: UploadAndMineResponse[] = [];

  constructor() { }

  findPrevAccount(state: State, index: number): Account {
    const cachedAcc = this.accounts.get(index);
    if (cachedAcc) {
      return cachedAcc;
    } else {
      return state.accounts.values[index].clone();
    }
  }

  findPrevFile(state: State, index: number): File {
    const cachedFile = this.files.get(index);
    if (cachedFile) {
      return cachedFile;
    } else {
      return state.files.values[index].clone();
    }
  }

  addAccount(state: State, acc: [AccountTx, SignaturePacked]) {
    this.accountTxs.push(acc);
    this.applyAccount(state, acc);
  }

  private applyAccount(state: State, acc: [AccountTx, SignaturePacked]) {
    const newSender = this.findPrevAccount(state, Number(acc[0].sender_index));
    const senderPk = BigInt(acc[1].a);
    newSender.balance = newSender.balance - BigInt(acc[0].amount);
    newSender.nonce = BigInt(acc[0].nonce) + 1n;
    newSender.key = senderPk;
    this.accounts.set(Number(acc[0].sender_index), newSender);
    this.accountIndices.set(senderPk, Number(acc[0].sender_index));

    const newReceiver = this.findPrevAccount(state, Number(acc[0].receiver_index));
    const receiverPk = BigInt(acc[0].receiver_key);
    newReceiver.balance = newReceiver.balance + BigInt(acc[0].amount);
    newReceiver.key = BigInt(receiverPk);
    this.accounts.set(Number(acc[0].receiver_index), newReceiver);
    this.accountIndices.set(receiverPk, Number(acc[0].receiver_index));
  }

  addFile(state: State, now: bigint, file: PendingSegment) {
    this.fileTxs.push(file);
    this.applyFile(state, now, file);
  }

  private applyFile(state: State, now: bigint, file: PendingSegment) {
    const newSender = this.findPrevAccount(state, Number(file.tx[0].sender_index));
    newSender.balance = newSender.balance - (BigInt(ssConfig.storage_fee) * BigInt(file.tx[0].time_interval));
    newSender.nonce = BigInt(file.tx[0].nonce) + 1n;
    this.accounts.set(Number(file.tx[0].sender_index), newSender);

    const newFile = this.findPrevFile(state, Number(file.tx[0].data_index));
    const expTime = newFile.expiration_time;
    newFile.data_hash = BigInt(file.tx[0].data);
    newFile.expiration_time = BigInt((now > expTime ? now : expTime) + BigInt(file.tx[0].time_interval));
    newFile.owner = BigInt(file.tx[0].sender_index);
    newFile.locked = false;
    this.files.set(Number(file.tx[0].data_index), newFile);
  }

  addMining(state: State, mining: UploadAndMineResponse) {
    this.mineTxs.push(mining);
    this.applyMining(state, mining);
  }

  private applyMining(state: State, mining: UploadAndMineResponse) {
    const newSender = this.findPrevAccount(state, Number(mining.tx[0].sender_index));
    newSender.random_oracle_nonce = BigInt(mining.tx[0].random_oracle_nonce);
    newSender.nonce = BigInt(mining.tx[0].nonce);
    newSender.balance = frAdd(newSender.balance, BigInt(ssConfig.mining_reward));
    this.accounts.set(Number(mining.tx[0].sender_index), newSender);
    this.accountIndices.set(BigInt(mining.tx[1].a), Number(mining.tx[0].sender_index));
  }

  clearOld(state: State, now: bigint, oldAccounts: [AccountTx, SignaturePacked][], oldFiles: PendingSegment[], oldMining: UploadAndMineResponse[]) {
    console.log('Clearing optimistic state...');

    this.accounts.clear();
    this.files.clear();
    this.accountIndices.clear();

    this.accountTxs = this.accountTxs.filter(tx => {
      return !oldAccounts.find(([oldTx, _sig]) => (
        oldTx.sender_index == tx[0].sender_index && oldTx.nonce === tx[0].nonce
      ));
    });
    this.fileTxs = this.fileTxs.filter(tx => {
      return !oldFiles.find(oldTx => (
        oldTx.tx[0].sender_index === tx.tx[0].sender_index && oldTx.tx[0].nonce === tx.tx[0].nonce
      ));
    });
    this.mineTxs = this.mineTxs.filter(tx => {
      return !oldMining.find(oldTx => (
        oldTx.tx[0].sender_index === tx.tx[0].sender_index && oldTx.tx[0].nonce === tx.tx[0].nonce
      ));
    });

    this.applyCachedTxs(state, now);
  }

  private applyCachedTxs(state: State, now: bigint) {
    for (const acc of this.accountTxs) {
      this.applyAccount(state, acc);
    }

    for (const file of this.fileTxs) {
      this.applyFile(state, now, file);
    }

    for (const mine of this.mineTxs) {
      this.applyMining(state, mine);
    }
  }
}

// TODO: Separation of concerns.
export class AppState {
  contract: IRollupContract = null!;

  roOffset: bigint = 0n;
  roValues: bigint[] = [];
  now: number = 0;

  // TODO: Replace naive global state with redis or some other queue (rabbitmq, kafka, etc.)
  //       Redis would probaly be the best choice since we can use it as a cache as well.
  private pendingAccounts: [AccountTx, SignaturePacked][] = [];
  private pendingSegments: PendingSegment[] = [];
  private pendingMining: UploadAndMineResponse[] = [];
  state: State = null!;
  blocks: Blocks = null!;
  // Public key of the master account for convenience.
  masterPk: Fr = null!;

  private optimisticState: OptimisticState = new OptimisticState();

  // Gateway-level metadata, useful for querying files by owner/path.
  fileMetadata: Level<bigint, FullFileMeta[]> = null!;
  // private accountCache: AccountCache = new AccountCache();

  blockInProgress: boolean = false;
  limit: number = 1000;

  private constructor() { }

  static async init(): Promise<AppState> {
    const self = new AppState();

    if (MOCK_BLOCKCHAIN) {
      self.contract = new RollupContractMock();
    } else {
      self.contract = await RollupContract.init();
    }

    self.fileMetadata = new Level(FILE_METADATA_PATH, {
      valueEncoding: 'json',
    });

    self.blocks = await Blocks.new(BLOCKS_PATH);
    self.masterPk = derivePublicKey(MASTER_SK)[0];

    if (
      !await checkFileExists(FILES_TREE_PATH) ||
      !await checkFileExists(ACCOUNT_TREE_PATH)
    ) {
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
      const accTree = new Tree(
        ssConfig.acc_data_tree_depth,
        [],
        [],
        (acc: Account) => acc.hash(),
      );
      accTree.fromBuffer(accTreeData, () => new Account());
      const fileTree = new Tree(
        ssConfig.acc_data_tree_depth,
        [],
        [],
        (file: File) => file.hash(),
      );
      fileTree.fromBuffer(fileTreeData, () => new File());

      self.state = new State(accTree, fileTree);
    }

    console.log('State loaded.');

    return self;
  }

  async getAccountByPk(pk: bigint): Promise<{ index: number, account: Account } | null> {
    const optimisticIndex = this.optimisticState.accountIndices.get(pk);
    if (optimisticIndex) {
      const account = this.optimisticState.accounts.get(optimisticIndex)!.clone();
      return { index: optimisticIndex, account };
    }

    // const cached = await this.accountCache.get(pk);
    // if (cached) {
    //   return cached;
    // }

    const index = this.state.accounts.values.findIndex((acc) => BigInt(acc.key) === BigInt(pk));
    if (index > -1) {
      return { index, account: this.state.accounts.values[index].clone() };
    } else {
      return null;
    }
  }

  getAccountByIndex(index: number): Account {
    const optimisticAccount = this.optimisticState.accounts.get(index);
    if (optimisticAccount) {
      return optimisticAccount;
    }

    return this.state.accounts.values[index].clone();
  }

  addAccountTransaction(account: AccountTx, signature: SignaturePacked) {
    if (this.pendingAccounts.length >= this.limit) {
      throw new Error('Too many pending transactions');
    }

    this.optimisticState.addAccount(this.state, [account, signature]);
    this.pendingAccounts.push([account, signature]);
  }

  addFileTransaction(
    file: FileTx,
    signature: SignaturePacked,
    data: Buffer,
    fileMetadata: FileMetadata,
    order: number,
  ) {
    if (this.pendingSegments.length >= this.limit) {
      throw new Error('Too many pending transactions');
    }

    const txPair: [FileTx, SignaturePacked] = [file, signature];
    const tx = { tx: txPair, data, order, fileMetadata }
    this.optimisticState.addFile(this.state, BigInt(this.now), tx);
    this.pendingSegments.push(tx);
  }

  addMiningTransaction(mining: UploadAndMineResponse) {
    this.optimisticState.addMining(this.state, mining);
    this.pendingMining.push(mining);
  }

  getVacantAccountIndex(): number {
    for (let i = 1; i < this.state.accounts.values.length; i++) {
      const acc = this.optimisticState.accounts.get(i) || this.state.accounts.values[i];
      if (acc.balance === 0n) {
        return i;
      }
    }

    throw new Error('No vacant account index');
  }

  getVacantFileIndices(num: number): number[] {
    const indices = [];
    for (let i = 0; i < this.state.files.values.length; i++) {
      const file = this.optimisticState.files.get(i) || this.state.files.values[i];
      const expired = file.expiration_time < BigInt(this.now);
      const empty = file.owner === 0n;

      if (expired || empty) {
        indices.push(i);
      }

      if (indices.length === num) {
        break;
      }
    }

    return indices;
  }

  async updateBlockchainState() {
    console.log('Updating blockchain state...');
    const { roOffset, roValues, latestBlock } = await this.contract.getRandomOracleValues();

    this.roOffset = roOffset;
    this.roValues = roValues;
    this.now = latestBlock;

    console.log('New random oracle:', roOffset, roValues);
    console.log('New now:', this.now);
  }

  async startSequencer() {
    console.log('Waiting for transactions...');
    while (true) {
      if (this.pendingAccounts.length === 0 && this.pendingSegments.length === 0 && this.pendingMining.length === 0) {
        console.log('No transactions, waiting...');
        await new Promise((resolve) =>
          setTimeout(resolve, BLOCK_TIME_INTERVAL),
        );
        continue;
      }

      if (!isAnyNodeConnected()) {
        console.log('No connected nodes, waiting...');
        await new Promise((resolve) =>
          setTimeout(resolve, BLOCK_TIME_INTERVAL),
        );
        continue;
      }

      console.log('Found transactions, batching...');
      const accounts = this.pendingAccounts.slice(
        0,
        ssConfig.account_tx_per_block,
      );
      const files = this.pendingSegments.slice(0, ssConfig.file_tx_per_block - 1);
      const mining = this.pendingMining.slice(0, ssConfig.mining_tx_per_block);
      this.pendingAccounts = this.pendingAccounts.slice(
        ssConfig.account_tx_per_block,
      );
      this.pendingSegments = this.pendingSegments.slice(ssConfig.file_tx_per_block - 1);
      this.pendingMining = this.pendingMining.slice(ssConfig.mining_tx_per_block);

      try {
        this.blockInProgress = true;
        await this.updateBlockchainState();

        const st = this.state.clone();

        this.state = await this.batchTransactions(
          st,
          BigInt(this.now),
          accounts,
          files,
          mining,
        );

        await this.saveState();
      } catch (err) {
        console.log('Failed to create a block:', err);
      }

      this.optimisticState.clearOld(this.state, BigInt(this.now), accounts, files, mining);
      this.blockInProgress = false;
    }
  }

  private async batchTransactions(
    st: State,
    now: bigint,
    accounts: [AccountTx, SignaturePacked][],
    files: PendingSegment[],
    _mining: UploadAndMineResponse[],
  ): Promise<State> {
    const mining: UploadAndMineResponse[] = [];
    // TODO: At this moment, mining is not possible outside of the current block (same `now`).
    //       Fix this either in the contract or the circuit.
    const miningNeeded = MINING_INTERVAL !== 0 && Number(now) % MINING_INTERVAL === 0;
    if (miningNeeded) {
      new Promise(async (resolve, reject) => {
        try {
          console.log('Broadcasting mining challenge...')
          const miningTx = await broadcastMiningChallenge(
            this.roValues,
            this.roOffset,
          );

          console.log('Mining response:', miningTx);

          mining.push(miningTx);
          resolve(void 0);
        } catch (err) {
          console.error('Failed to mine:', err);
          reject(err);
        }
      });
    }

    console.log('Creating a new block...');

    const stateHash = st.hash();
    const stateRoot: Root = {
      acc: fr_serialize(st.accounts.root()),
      data: fr_serialize(st.files.root()),
    };

    const accTxs = accounts.map((acc) => st.build_account_txex(acc));
    const accTxsPadded = pad_array(
      accTxs,
      ssConfig.account_tx_per_block,
      blank_account_tx(ssConfig),
    );

    const miningTxs = mining.map(m => {
      return st.build_mining_txex(
        m.miningRes,
        m.word,
        m.tx,
      );
    });
    const miningTxsPadded = pad_array(
      miningTxs,
      ssConfig.mining_tx_per_block,
      blank_mining_tx(ssConfig),
    );

    const fileTxs = files.map((file) => {
      return st.build_file_txex(now, BigInt(file.tx[0].data), file.tx);
    });
    const fileTxsPaddedIncomplete = pad_array(
      fileTxs,
      ssConfig.file_tx_per_block - 1,
      blank_file_tx(ssConfig),
    );

    // [pk, path] => FullFileMeta
    const gatewayMetas = files.reduce((acc, seg) => {
      const accPk = st.accounts.values[Number(seg.tx[0].sender_index)].key;
      const key: [bigint, string] = [accPk, seg.fileMetadata.path];
      let entry = acc.get(key);
      if (entry) {
        entry.fileIndices.push({ segmentIndex: BigInt(seg.tx[0].data_index), order: seg.order });
      } else {
        acc.set(
          key,
          new FullFileMeta(
            seg.fileMetadata.hash,
            seg.fileMetadata.path,
            seg.fileMetadata.size,
            [{ segmentIndex: BigInt(seg.tx[0].data_index), order: seg.order }]
          )
        );
      }

      return acc;
    }, new Map<[bigint, string], FullFileMeta>());

    const metaFile = new MetadataFile(accTxs, fileTxs, miningTxs, [...gatewayMetas.values()]);
    const metaFileData = metaFile.serialize();
    const metaFileDataCompressed = await brotliCompressAsync(metaFileData);
    const encodedMetaFileSegments = encodeFile(metaFileDataCompressed);

    if (encodedMetaFileSegments.length > 1) {
      console.error('Meta file bigger than expected', metaFile);
      throw new Error(`Metadata file too large: ${encodedMetaFileSegments.length} segments of sizes ${encodedMetaFileSegments.map((x) => x.length).join(`, `)}. Only data that fits into a single segment is supported.`);
    }

    const metaFileSegment = encodedMetaFileSegments[0];
    const metaFileElements = bufferToFrElements(metaFileSegment).map((el) => BigInt(el.toString()));
    const metaFileTree = Tree.init(ssConfig.file_tree_depth, metaFileElements, 0n, (t: any) => t);

    // Create the special 0th file tx that saves all of txes we've seen so far into ShardedStorage
    const masterAccount = st.accounts.values[0];
    const masterAccountNonce = BigInt(masterAccount.nonce);

    const metaFileIndex = (1 << ssConfig.acc_data_tree_depth) - this.blocks.count() - 1;
    const metaFileDuration = 7149n * 1000n; // ~1000 days
    const metaFileSender = 0;
    const metaFileTxData: FileTx = {
      sender_index: metaFileSender.toString(),
      data_index: metaFileIndex.toString(),
      time_interval: fr_serialize(metaFileDuration),
      data: metaFileTree.root().toString(),
      nonce: masterAccountNonce.toString(),
    };
    const metaTxTree = Tree.init(
      ssConfig.file_tree_depth,
      pad_array(
        pack_tx(
          accTxsPadded.map((x) => x.tx),
          miningTxsPadded.map((x) => x.tx),
          [...fileTxsPaddedIncomplete.map((x) => x.tx), metaFileTxData],
        ),
        1 << ssConfig.file_tree_depth,
        0n,
      ),
      0n,
      (x: any) => x,
    );

    const metaFileTx = prep_file_tx(
      metaFileDuration,
      metaFileSender,
      metaFileIndex,
      metaTxTree.root(),
      MASTER_SK,
      masterAccountNonce,
    );

    const metaFileTxEx = st.build_file_txex(now, metaTxTree.root(), metaFileTx, true);
    const fileTxsPadded = [...fileTxsPaddedIncomplete, metaFileTxEx];

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
        offset: this.roOffset.toString(),
        data: this.roValues.map((x) => x.toString()),
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
        txs: miningTxsPadded,
      },
      old_root: stateRoot,
      new_root: newStateRoot,
    };

    console.log('Old root:', stateHash);
    console.log('New root:', newStateHash);

    const proverData: ProverToml = {
      pubhash: pubInputHash,
      input: input,
    };

    console.log('Generating proof...');
    const start = Date.now();
    const proof = await prove('../circuits/', proverData);
    console.log('Proof generated in', Date.now() - start, 'ms');

    if (!await verify('../circuits/', proof)) {
      throw new Error('Proof verification failed');
    }

    // FIXME: Everything below must be atomic.
    // Upload segments to storage nodes
    console.log('Uploading segments...');
    if (files.length > 0) {
      const segments = files.map((f) => ({ id: f.tx[0].data_index, data: f.data }));
      await upload(segments);
    }

    // Upload the meta file to storage nodes
    console.log('Uploading metadata...');
    await upload([{ id: metaFileIndex.toString(), data: Buffer.from(metaFileSegment) }]);

    console.log('Publishing block...');
    const txHash = await this.contract.publishBlock(newStateHash, now, proof[1]);
    console.log('Block published:', txHash);

    // Group metadata by owner.
    const userMetas = Array.from(gatewayMetas.entries()).reduce((acc, [[pk, _path], meta]) => {
      let entry = acc.get(pk);
      if (entry) {
        entry.push(meta);
      } else {
        acc.set(pk, [meta]);
      }

      return acc;
    }, new Map<bigint, FullFileMeta[]>());

    // Cache gateway-level metadata.
    // FIXME: Get rid of linear search.
    console.log('Caching file metadata...');
    try {
      for (const [pk, metas] of userMetas.entries()) {
        let storedMetas: FullFileMeta[];
        try {
          storedMetas = await this.fileMetadata.get(pk);
        } catch (err) {
          storedMetas = [...metas];
        }

        for (const meta of metas) {
          const existing = storedMetas.find((m) => m.fileHash === meta.fileHash);
          if (existing) {
            // TODO: Maybe store the map directly?
            const orderMap = new Map<number, { order: number, segmentIndex: bigint }>();
            for (const { order, segmentIndex } of existing.fileIndices.concat(meta.fileIndices)) {
              orderMap.set(order, { order, segmentIndex });
            }
            existing.fileIndices = Array.from(orderMap.values());
            existing.fileIndices.sort((a, b) => a.order - b.order);
          } else {
            storedMetas.push(meta);
          }
        }

        await this.fileMetadata.put(pk, storedMetas);
      }
    } catch (err) {
      console.error('Failed to cache file metadata:', err);
    }

    const block = this.blocks.createNewBlock(newStateHash.toString(), txHash, Number(now));
    await this.blocks.addBlock(block);

    // // Cache accounts
    // console.log('Caching accounts...');
    // for (const acc of accounts) {
    //   const senderIndex = Number(acc[0].sender_index);
    //   const sender = st.accounts.values[senderIndex];
    //   await this.accountCache.put(BigInt(acc[0].sender_index), { index: senderIndex, account: sender });

    //   const receiverIndex = Number(acc[0].receiver_index);
    //   const receiver = st.accounts.values[receiverIndex];
    //   await this.accountCache.put(BigInt(acc[0].receiver_index), { index: receiverIndex, account: receiver });
    // }

    // for (const file of files) {
    //   const senderIndex = file.tx[0].sender_index;
    //   const sender = st.accounts.values[Number(senderIndex)];
    //   await this.accountCache.put(BigInt(senderIndex), { index: Number(senderIndex), account: sender });
    // }

    console.log('Block published:', txHash);

    return st;
  }

  private async saveState() {
    console.log('Saving account tree')
    await fs.writeFile(ACCOUNT_TREE_PATH, this.state.accounts.toBuffer());
    console.log('Saving file tree')
    await fs.writeFile(FILES_TREE_PATH, this.state.files.toBuffer());
  }
}

export async function initAppState() {
  appState = await AppState.init();
  appState.startSequencer();
}

async function checkFileExists(path: string): Promise<boolean> {
  try {
    let res = await fs.access(path, fs.constants.F_OK);
  } catch (e) {
    return false;
  }
  return true;
}

// TODO: Move to a separate module
export class MetadataFile {
  accountTxs: AccountTxEx[];
  fileTxs: FileTxEx[];
  miningTxs: MiningTxEx[];

  // TODO: It's not a part of the core protocol, it should be stored separately in production.
  meta: FullFileMeta[];

  constructor(accountTxs: AccountTxEx[], fileTxs: FileTxEx[], miningTxs: MiningTxEx[], meta: FullFileMeta[]) {
    this.accountTxs = accountTxs;
    this.fileTxs = fileTxs;
    this.miningTxs = miningTxs;
    this.meta = meta;
  }

  serialize(): Buffer {
    const w = new BinaryWriter();

    w.writeArray(this.accountTxs, (tx: AccountTxEx) => {
      // sender_index: Field;
      // receiver_index: Field;
      // receiver_key: Field;
      // amount: Field;
      // nonce: Field;
      w.writeU256(BigInt(tx.tx.sender_index));
      w.writeU256(BigInt(tx.tx.receiver_index));
      w.writeU256(BigInt(tx.tx.receiver_key));
      w.writeU256(BigInt(tx.tx.amount));
      w.writeU256(BigInt(tx.tx.nonce));

      // proof_sender: MerkleProof;
      // proof_receiver: MerkleProof;
      // account_sender: Account;
      // account_receiver: Account;
      // signature: SignaturePacked;
      serializeMerkleProof(w, tx.assets.proof_sender);
      serializeMerkleProof(w, tx.assets.proof_receiver);
      serializeAccount(w, tx.assets.account_sender);
      serializeAccount(w, tx.assets.account_receiver);
      serializeSignature(w, tx.assets.signature);
    });

    w.writeArray(this.fileTxs, (tx: FileTxEx) => {
      // sender_index: Field;
      // data_index: Field;
      // time_interval: Field;
      // data: Field;
      // nonce: Field;
      w.writeU256(BigInt(tx.tx.sender_index));
      w.writeU256(BigInt(tx.tx.data_index));
      w.writeU256(BigInt(tx.tx.time_interval));
      w.writeU256(BigInt(tx.tx.data));
      w.writeU256(BigInt(tx.tx.nonce));

      // proof_sender: MerkleProof;
      // proof_file: MerkleProof;
      // account_sender: Account;
      // file: File;
      // signature: SignaturePacked;
      serializeMerkleProof(w, tx.assets.proof_sender);
      serializeMerkleProof(w, tx.assets.proof_file);
      serializeAccount(w, tx.assets.account_sender);
      serializeFile(w, tx.assets.file);
      serializeSignature(w, tx.assets.signature);
    });

    w.writeArray(this.miningTxs, (tx: MiningTxEx) => {
      // sender_index: Field;
      // nonce: Field;
      // random_oracle_nonce: Field;
      // mining_nonce: Field;
      w.writeU256(BigInt(tx.tx.sender_index));
      w.writeU256(BigInt(tx.tx.nonce));
      w.writeU256(BigInt(tx.tx.random_oracle_nonce));
      w.writeU256(BigInt(tx.tx.mining_nonce));

      // proof_sender: MerkleProof;
      // account_sender: Account;
      // random_oracle_value: Field;
      // proof_file: MerkleProof;
      // file: File;
      // proof_data_in_file: MerkleProof;
      // data_in_file: Field;
      // signature: SignaturePacked;
      serializeMerkleProof(w, tx.assets.proof_sender);
      serializeAccount(w, tx.assets.account_sender);
      w.writeU256(BigInt(tx.assets.random_oracle_value));
      serializeMerkleProof(w, tx.assets.proof_file);
      serializeFile(w, tx.assets.file);
      serializeMerkleProof(w, tx.assets.proof_data_in_file);
      w.writeU256(BigInt(tx.assets.data_in_file));
      serializeSignature(w, tx.assets.signature);
    });

    w.writeArray(this.meta, (m: FullFileMeta) => {
      m.serialize(w);
    });

    return w.toBuffer();
  }

  static deserialize(buffer: Buffer): MetadataFile {
    const r = new BinaryReader(buffer);

    const accountTxs = r.readArray(() => {
      const tx = {
        sender_index: r.readU256().toString(),
        receiver_index: r.readU256().toString(),
        receiver_key: r.readU256().toString(),
        amount: r.readU256().toString(),
        nonce: r.readU256().toString(),
      };
      const assets = {
        proof_sender: deserializeMerkleProof(r),
        proof_receiver: deserializeMerkleProof(r),
        account_sender: deserializeAccount(r),
        account_receiver: deserializeAccount(r),
        signature: deserializeSignature(r),
      };
      return { tx, assets };
    });

    const fileTxs = r.readArray(() => {
      const tx = {
        sender_index: r.readU256().toString(),
        data_index: r.readU256().toString(),
        time_interval: r.readU256().toString(),
        data: r.readU256().toString(),
        nonce: r.readU256().toString(),
      };
      const assets = {
        proof_sender: deserializeMerkleProof(r),
        proof_file: deserializeMerkleProof(r),
        account_sender: deserializeAccount(r),
        file: deserializeFile(r),
        signature: deserializeSignature(r),
      };
      return { tx, assets };
    });

    const miningTxs = r.readArray(() => {
      const tx = {
        sender_index: r.readU256().toString(),
        nonce: r.readU256().toString(),
        random_oracle_nonce: r.readU256().toString(),
        mining_nonce: r.readU256().toString(),
      };
      const assets = {
        proof_sender: deserializeMerkleProof(r),
        account_sender: deserializeAccount(r),
        random_oracle_value: r.readU256().toString(),
        proof_file: deserializeMerkleProof(r),
        file: deserializeFile(r),
        proof_data_in_file: deserializeMerkleProof(r),
        data_in_file: r.readU256().toString(),
        signature: deserializeSignature(r),
      };
      return { tx, assets };
    });

    const meta = r.readArray(() => FullFileMeta.deserialize(r));

    return new MetadataFile(accountTxs, fileTxs, miningTxs, meta);
  }
}

function serializeMerkleProof(w: BinaryWriter, proof: MerkleProof) {
  // index_bits: u1[];
  // hash_path: Field[];

  w.writeArray(proof.index_bits, (b: boolean) => w.writeU8(b ? 1 : 0));
  w.writeArray(proof.hash_path, (h: string) => w.writeU256(BigInt(h)));
}

function serializeAccount(w: BinaryWriter, acc: AccountType) {
  // key: Field;
  // balance: Field;
  // nonce: Field;
  // random_oracle_nonce: Field;

  w.writeU256(BigInt(acc.key));
  w.writeU256(BigInt(acc.balance));
  w.writeU256(BigInt(acc.nonce));
  w.writeU256(BigInt(acc.random_oracle_nonce));
}

function serializeFile(w: BinaryWriter, file: FileType) {
  // expiration_time: Field;
  // locked: boolean;
  // owner: Field;
  // data: Field;

  w.writeU256(BigInt(file.expiration_time));
  w.writeU8(file.locked ? 1 : 0);
  w.writeU256(BigInt(file.owner));
  w.writeU256(BigInt(file.data));
}

function serializeSignature(w: BinaryWriter, sig: SignaturePacked) {
  // a: Field;
  // s: Field;
  // r8: Field;
  w.writeU256(BigInt(sig.a));
  w.writeU256(BigInt(sig.s));
  w.writeU256(BigInt(sig.r8));
}

function deserializeMerkleProof(r: BinaryReader): MerkleProof {
  return {
    index_bits: r.readArray(() => r.readU8() === 1),
    hash_path: r.readArray(() => r.readU256().toString()),
  };
}

function deserializeAccount(r: BinaryReader): AccountType {
  return {
    key: r.readU256().toString(),
    balance: r.readU256().toString(),
    nonce: r.readU256().toString(),
    random_oracle_nonce: r.readU256().toString(),
  };
}

function deserializeFile(r: BinaryReader): FileType {
  return {
    expiration_time: r.readU256().toString(),
    locked: r.readU8() === 1,
    owner: r.readU256().toString(),
    data: r.readU256().toString(),
  };
}

function deserializeSignature(r: BinaryReader): SignaturePacked {
  return {
    a: r.readU256().toString(),
    s: r.readU256().toString(),
    r8: r.readU256().toString(),
  };
}

export class FullFileMeta {
  fileHash: bigint;
  filePath: string;
  fileSize: number;
  fileIndices: { order: number, segmentIndex: bigint }[];

  constructor(fileHash: bigint, filePath: string, fileSize: number, fileIndices: { order: number, segmentIndex: bigint }[]) {
    this.fileHash = fileHash;
    this.filePath = filePath;
    this.fileSize = fileSize;
    this.fileIndices = fileIndices;
  }

  serialize(w: BinaryWriter) {
    w.writeU256(this.fileHash);
    w.writeString(this.filePath);
    w.writeU64(this.fileSize);
    w.writeArray(this.fileIndices, ({ order, segmentIndex }: { order: number, segmentIndex: bigint }) => {
      w.writeU32(Number(order));
      w.writeU64(segmentIndex)
    });
  }

  static deserialize(r: BinaryReader): FullFileMeta {
    const fileHash = r.readU256();
    const filePath = r.readString();
    const fileSize = r.readU64();
    const fileIndices = r.readArray(() => ({
      order: r.readU32(),
      segmentIndex: r.readU64(),
    }));

    return new FullFileMeta(fileHash, filePath, fileSize, fileIndices);
  }
}
