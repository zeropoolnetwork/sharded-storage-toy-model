import { ethers } from 'ethers';
import { OPERATOR_SK, ROLLUP_CONTRACT_ADDRESS, RPC_URL } from './env';
import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';

export interface IRollupContract {
  publishBlock(newRoot: bigint, now: bigint, proof: Uint8Array): Promise<string>;
  getRoot(): Promise<number>;
  getLastCommittedBlockNumber(): Promise<number>;
  getOwner(): Promise<string>;
  getRandomOracleValues(randomOracleSize: number): Promise<[bigint, bigint[], number]>; // FIXME: return an object
}

export class RollupContract implements IRollupContract {
  private contract: ethers.Contract;
  private signer: ethers.Signer;
  private provider: ethers.Provider;

  constructor(
    provider: ethers.Provider,
    contractAddress: string,
    signer: ethers.Signer,
  ) {
    const abi = [
      'function publish_block(uint256 new_root, uint256 _now, bytes _proof) external',
      'function root() view returns (uint256)',
      'function last_committed_blocknumber() view returns (uint256)',
      'function owner() view returns (address)',
    ];

    this.contract = new ethers.Contract(contractAddress, abi, provider);
    this.signer = signer;
    this.provider = provider;
  }

  static async init(): Promise<RollupContract> {
    console.log('Initializing Rollup contract');

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(OPERATOR_SK, provider);
    const signer = wallet.connect(provider);

    const contract = new RollupContract(
      provider,
      ROLLUP_CONTRACT_ADDRESS,
      signer,
    );

    const owner = await contract.getOwner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error('Specified OPERATOR_SK is not the owner of the contract');
    }

    console.log('Rollup contract initialized');

    return contract;
  }

  async publishBlock(
    newRoot: bigint,
    now: bigint,
    proof: Uint8Array,
  ): Promise<string> {
    const connectedContract = this.contract.connect(this.signer);
    // @ts-ignore
    const tx = await connectedContract.publish_block(newRoot, now, proof);

    const receipt = await tx.wait();

    if (receipt.status === 1) {
      console.log('Transaction was successful!');
    } else {
      console.log('Transaction failed.');
    }

    return tx.hash;
  }

  async getRoot(): Promise<number> {
    return await this.contract.root();
  }

  async getLastCommittedBlockNumber(): Promise<number> {
    return await this.contract.last_committed_blocknumber();
  }

  async getOwner(): Promise<string> {
    return await this.contract.owner();
  }

  async getRandomOracleValues(
    randomOracleSize: number,
  ): Promise<[bigint, bigint[], number]> {
    const blockNumber = await this.provider.getBlockNumber();

    const promises: Promise<ethers.Block | null>[] = [];
    for (let i = blockNumber - randomOracleSize + 1; i <= blockNumber; i++) {
      promises.push(this.provider.getBlock(i));
    }

    const values = (await Promise.all(promises)).map((b) => {
      return BigInt(b?.hash ?? '0');
    });

    return [BigInt(blockNumber - defShardedStorageSettings.oracle_len), values, blockNumber];
  }
}

export class RollupContractMock implements IRollupContract {
  latestBlockNumber: number = 1337;

  constructor() { }

  async publishBlock(
    newRoot: bigint,
    now: bigint,
    proof: Uint8Array,
  ): Promise<string> {
    this.latestBlockNumber++;

    return `0x${(this.latestBlockNumber - 1).toString(16)}`;
  }

  async getRoot(): Promise<number> {
    return 0;
  }

  async getLastCommittedBlockNumber(): Promise<number> {
    return this.latestBlockNumber;
  }

  async getOwner(): Promise<string> {
    return '';
  }

  async getRandomOracleValues(
    randomOracleSize: number,
  ): Promise<[bigint, bigint[], number]> {
    const values = Array(randomOracleSize).fill(0n).map((_, i) => BigInt(this.latestBlockNumber - i));
    return [0n, values, this.latestBlockNumber];
  }
}
