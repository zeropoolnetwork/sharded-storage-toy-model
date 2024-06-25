import { ethers } from 'ethers';
import { OPERATOR_SK, ROLLUP_CONTRACT_ADDRESS, RPC_URL } from './env';
import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';

export interface IRollupContract {
  latestBlockNumber: number; // FIXME 
  publishBlock(newRoot: bigint, now: bigint, proof: string): Promise<void>;
  getRoot(): Promise<number>;
  getLastCommittedBlockNumber(): Promise<number>;
  getOwner(): Promise<string>;
  getRandomOracleValues(randomOracleSize: number): Promise<[bigint, bigint[]]>;
}

export class RollupContract implements IRollupContract {
  private contract: ethers.Contract;
  private signer: ethers.Signer;
  private provider: ethers.Provider;

  latestBlockNumber: number = 0;

  constructor(provider: ethers.Provider, contractAddress: string, signer: ethers.Signer) {
    const abi = [
      "function publish_block(uint256 new_root, uint256 _now, bytes _proof) external",
      "function root() view returns (uint256)",
      "function last_committed_blocknumber() view returns (uint256)",
      "function owner() view returns (address)"
    ];

    this.contract = new ethers.Contract(contractAddress, abi, provider);
    this.signer = signer;
    this.provider = provider;
  }

  static async init(): Promise<RollupContract> {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(OPERATOR_SK, provider);
    const signer = wallet.connect(provider);

    const contract = new RollupContract(provider, ROLLUP_CONTRACT_ADDRESS, signer);

    const owner = await contract.getOwner();
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error('Specified OPERATOR_SK is not the owner of the contract');
    }

    contract.latestBlockNumber = await contract.provider.getBlockNumber();

    return contract;
  }

  async publishBlock(newRoot: bigint, now: bigint, proof: string): Promise<void> {
    const connectedContract = this.contract.connect(this.signer);
    // @ts-ignore
    const res = await connectedContract.publish_block(newRoot, now, proof);

    // TODO: Check if the transaction was successful    

    this.latestBlockNumber = await this.provider.getBlockNumber();
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

  async getRandomOracleValues(randomOracleSize: number): Promise<[bigint, bigint[]]> {
    const blockNumber = this.latestBlockNumber || await this.provider.getBlockNumber();

    const promises: Promise<ethers.Block | null>[] = [];
    for (let i = blockNumber - randomOracleSize + 1; i <= blockNumber; i++) {
      promises.push(this.provider.getBlock(i));
    }

    const values = (await Promise.all(promises)).map((b) => {
      return BigInt(b?.hash ?? '0');
    });

    return [BigInt(blockNumber - defShardedStorageSettings.oracle_len), values];
  }
}

export class RollupContractMock implements IRollupContract {
  latestBlockNumber: number = 0;

  constructor() { }


  async publishBlock(newRoot: bigint, now: bigint, proof: string): Promise<void> {
    this.latestBlockNumber++;

    return;
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

  async getRandomOracleValues(randomOracleSize: number): Promise<[bigint, bigint[]]> {
    return [0n, Array(randomOracleSize).fill(0n)];
  }
}
