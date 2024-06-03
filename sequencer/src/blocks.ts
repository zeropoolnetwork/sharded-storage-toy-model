import { Level } from 'level';

export interface Block {
  index: number;
  timestamp: string;
  previousHash: string;
  hash: string;
  // nonce: number;
}

export class Blocks {
  blocks: Level<string, Block> = null!;
  latestBlock: Block = null!;

  static async new(storagePath: string = './blocks'): Promise<Blocks> {
    const self = new Blocks();

    self.blocks = new Level(storagePath, { valueEncoding: 'json' });

    try {
      self.latestBlock = await self.blocks.get('latest');
    } catch (error) {
      console.warn('No blocks found. Creating a new chain.');

      self.latestBlock = {
        index: 0,
        timestamp: new Date().toISOString(),
        previousHash: '0',
        hash: '0',
      };

      await self.blocks.put('latest', self.latestBlock);
    }

    return self;
  }

  createNewBlock(): Block {
    return {
      index: this.latestBlock.index + 1,
      timestamp: new Date().toISOString(),
      previousHash: this.latestBlock.hash,
      hash: '',
    };
  }

  async addBlock(block: Block) {
    await this.blocks.put(block.hash, block);
    await this.blocks.put('latest', block);
    this.latestBlock = block;
  }

  async getBlock(hash: string): Promise<Block | undefined> {
    try {
      return await this.blocks.get(hash);
    } catch (error) {
      return undefined;
    }
  }

  getLatestBlock(): Block {
    return this.latestBlock;
  }

  // TODO: Optimize
  async getNLatestBlocks(n: number): Promise<Block[]> {
    const blocks: Block[] = [this.latestBlock];

    let latestBlock = this.latestBlock;
    while (blocks.length < n && this.latestBlock.index === 0) {
      const block = await this.getBlock(latestBlock.previousHash);

      if (block) {
        latestBlock = block;
        blocks.push(block);
      } else {
        break;
      }
    }

    return blocks;
  }
}
