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
  VerifierToml,
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
import { upload, broadcastMiningChallenge, UploadAndMineResponse } from './nodes';
import { BinaryWriter } from 'zpst-common/src/binary';
import { encodeFile, bufferToFrElements } from 'zpst-common/src/codec';

const FILES_TREE_PATH = './data/files_tree.bin';
const ACCOUNT_TREE_PATH = './data/account_tree.bin';
const ACCOUNTS_PATH = './data/accounts';
const FILE_METADATA_PATH = './data/file_metadata';
const DEFAULT_DURATION = 7149n * 10n; // ~10 days

const ssConfig = defShardedStorageSettings;
export let appState: AppState;

export interface FileData {
  data: Buffer;
  metadata: FileMetadata;
}

export interface FileMetadata {
  path: string;
  size: number;
}

interface FileMetadataEx extends FileMetadata {
  expiration_time: string;
}

export interface AccountData {
  index: string;
  balance: string;
  nonce: string;
  random_oracle_nonce: string;
}

export class AppState {
  contract: IRollupContract = null!;

  roOffset: bigint = 0n;
  roValues: bigint[] = [];
  now: number = 0;

  // FIXME: temporary measure to stop mining when there are no transactions.
  miningNeeded: boolean = false;

  // TODO: Replace naive global state with redis or some other queue (rabbitmq, kafka, etc.)
  //       Redis would probaly be the best choice since we can use it as a cache as well.
  pendingAccounts: [AccountTx, SignaturePacked][] = [];
  pendingFiles: { tx: [FileTx, SignaturePacked]; data: FileData }[] = [];
  pendingMining: UploadAndMineResponse[] = [];
  state: State = null!;
  blocks: Blocks = null!;
  // Public key of the master account for convenience.
  masterPk: Fr = null!;
  // Account cache (user public key -> account data)
  accounts: Level<string, AccountData> = null!;

  // Gateway-specific metadata
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
    self.fileMetadata = new Level(FILE_METADATA_PATH, {
      valueEncoding: 'json',
    });
    self.counters = new Level('./data/counters');

    self.blocks = await Blocks.new('./data/blocks');
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

      await self.accounts.put(self.masterPk.toString(), {
        index: '0',
        balance: bigIntToFr(GENESIS_BALANCE).toString(),
        nonce: '0',
        random_oracle_nonce: '0',
      });
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
      accTree.deserialize(accTreeData, () => new Account());
      const fileTree = new Tree(
        ssConfig.acc_data_tree_depth,
        [],
        [],
        (file: File) => file.hash(),
      );
      fileTree.deserialize(fileTreeData, () => new File());

      self.state = new State(accTree, fileTree);
    }

    console.log('State loaded.');

    return self;
  }

  async addAccountTransaction(account: AccountTx, signature: SignaturePacked) {
    this.pendingAccounts.push([account, signature]);
  }

  async addFileTransaction(
    file: FileTx,
    signature: SignaturePacked,
    data: FileData,
  ) {
    this.pendingFiles.push({ tx: [file, signature], data });
  }

  // FIXME: quick and dirty id/index allocation
  async getVacantIndices(): Promise<{
    vacantFileIndex: number;
    vacantAccountIndex: number;
  }> {
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

  async updateBlockchainState() {
    console.log('Updating blockchain state...');
    const [roOffset, roValues, latestBlock] = await this.contract.getRandomOracleValues(ssConfig.oracle_len);
    const now = latestBlock - ssConfig.oracle_len;

    this.roOffset = roOffset;
    this.roValues = roValues;
    this.now = now;

    console.log('New random oracle:', roOffset, roValues);
    console.log('New now:', now);
  }

  async startSequencer() {
    setTimeout(async () => {
      console.log('Starting mining loop...')
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, MINING_INTERVAL));
        if (!this.miningNeeded) {
          continue;
        }

        console.log('Broadcasting mining challenge...')
        const mining = await broadcastMiningChallenge(
          this.roValues,
          this.roOffset,
        );

        this.pendingMining.push(mining);
        this.miningNeeded = false;
      }
    }, 1);

    console.log('Waiting for transactions...');
    while (true) {
      if (this.pendingAccounts.length === 0 && this.pendingFiles.length === 0 && this.pendingMining.length === 0) {
        console.log('No transactions, waiting...');
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
      const files = this.pendingFiles.slice(0, ssConfig.file_tx_per_block);
      const mining = this.pendingMining.slice(0, ssConfig.mining_tx_per_block);
      this.pendingAccounts = this.pendingAccounts.slice(
        ssConfig.account_tx_per_block,
      );
      this.pendingFiles = this.pendingFiles.slice(ssConfig.file_tx_per_block);
      this.pendingMining = this.pendingMining.slice(ssConfig.mining_tx_per_block);

      try {
        await this.updateBlockchainState();

        await this.batchTransactions(
          BigInt(this.now),
          accounts,
          files,
          mining,
        );

        await this.saveState();
      } catch (err) {
        console.log(
          'Failed to create a block:',
          err,
          'Discarding transactions...',
        );
      }

    }
  }

  private async batchTransactions(
    now: bigint,
    accounts: [AccountTx, SignaturePacked][],
    files: { tx: [FileTx, SignaturePacked]; data: FileData }[],
    mining: UploadAndMineResponse[],
  ): Promise<void> {
    console.log('Creating a new block...');

    const st = this.state.clone();

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
      const hash = BigInt(file.tx[0].data); // FIXME: Is this correct or do I need to calculate the hash?
      return st.build_file_txex(now, hash, file.tx);
    });
    const fileTxsPaddedIncomplete = pad_array(
      fileTxs,
      ssConfig.file_tx_per_block - 1,
      blank_file_tx(ssConfig),
    );


    const gatewayMetas = files.reduce((acc, seg) => {
      let entry = acc.get(seg.data.metadata.path);
      if (entry) {
        entry.fileIndices.push(BigInt(seg.tx[0].data_index));
      } else {
        acc.set(seg.data.metadata.path, new GatewayMeta(seg.data.metadata.path, seg.data.metadata.size, [BigInt(seg.tx[0].data_index)]));
      }

      return acc;
    }, new Map<string, GatewayMeta>());

    const metaFile = new MetadataFile(accTxs, fileTxs, miningTxs, [...gatewayMetas.values()]);
    const metaFileData = metaFile.serialize();
    const encodedMetaFileSegments = encodeFile(metaFileData);

    if (encodedMetaFileSegments.length > 1) {
      throw new Error('Metadata file too large');
    }

    const metaFileSegment = encodedMetaFileSegments[0];
    const metaFileElements = bufferToFrElements(metaFileSegment).map((el) => BigInt(el.toString()));
    const metaFileTree = Tree.init(ssConfig.file_tree_depth, metaFileElements, 0n, (t: any) => t);

    // Create the special 0th file tx that saves all of txes we've seen so far into ShardedStorage
    const masterAccount: AccountData = await this.accounts.get(
      this.masterPk.toString(),
    ); // Can't fail since we add the master account on start

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
    const metaTxData = Tree.init(
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
      metaTxData.root(),
      MASTER_SK,
      masterAccountNonce,
    );

    masterAccount.nonce = (masterAccountNonce + 1n).toString();

    const metaFileTxEx = st.build_file_txex(now, metaTxData.root(), metaFileTx);
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

    const proverData: ProverToml = {
      pubhash: pubInputHash,
      input: input,
    };

    const proof = prove('../circuits/', proverData);

    const verifierData: VerifierToml = {
      pubhash: pubInputHash,
    };

    if (!verify('../circuits/', verifierData, proof)) {
      throw new Error('Proof verification failed');
    }

    const txHash = await this.contract.publishBlock(newStateHash, now, proof);

    // Upload segments to storage nodes
    await upload(
      files.map((f) => ({ id: f.tx[0].data_index, data: f.data.data })),
    );

    // Upload the meta file to storage nodes
    await upload([{ id: metaFileIndex.toString(), data: Buffer.from(metaFileSegment) }]);

    await Promise.all(
      files.map((f) => {
        return this.fileMetadata.put(f.tx[0].data_index.toString(), {
          expiration_time: (now + DEFAULT_DURATION).toString(),
          ...f.data.metadata,
        });
      }),
    );

    const block = this.blocks.createNewBlock();
    block.txHash = txHash;
    block.newRoot = newStateHash.toString(); // FIXME: hex?
    block.now = Number(now);

    await this.blocks.addBlock(block);

    await this.incrementIndices(
      accounts.length,
      files.length,
    );

    // FIMXE: temporary
    if (accounts.length > 0 || files.length > 0) {
      this.miningNeeded = true;
    }

    for (let account of accounts) {
      const accData = await this.accounts.get(account[0].sender_index);
      accData.balance = frAdd(BigInt(accData.balance), BigInt(account[0].amount)).toString();
      accData.nonce = (BigInt(accData.nonce) + 1n).toString();
      await this.accounts.put(account[0].sender_index, accData);
    }

    this.state = st;
  }

  // FIXME: replace with a proper account/file slot allocation system.
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
    console.log('Saving account tree')
    await fs.writeFile(ACCOUNT_TREE_PATH, this.state.accounts.serialize());
    console.log('Saving file tree')
    await fs.writeFile(FILES_TREE_PATH, this.state.files.serialize());
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
class MetadataFile {
  accountTxs: AccountTxEx[];
  fileTxs: FileTxEx[];
  miningTxs: MiningTxEx[];
  meta: GatewayMeta[];

  constructor(accountTxs: AccountTxEx[], fileTxs: FileTxEx[], miningTxs: MiningTxEx[], meta: GatewayMeta[]) {
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

    w.writeArray(this.meta, (m: GatewayMeta) => {
      w.writeBuffer(m.serialize());
    });

    return w.toBuffer();
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

class GatewayMeta {
  filePath: string;
  fileSize: number;
  fileIndices: bigint[];

  constructor(filePath: string, fileSize: number, fileIndices: bigint[]) {
    this.filePath = filePath;
    this.fileSize = fileSize;
    this.fileIndices = fileIndices;
  }

  serialize(): Buffer {
    const w = new BinaryWriter();

    w.writeString(this.filePath);
    w.writeU64(this.fileSize);
    w.writeArray(this.fileIndices, (n: bigint) => w.writeU64(n));

    return w.toBuffer();
  }
}
