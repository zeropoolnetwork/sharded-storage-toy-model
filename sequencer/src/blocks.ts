import { Level } from 'level';

export interface Block {
  oldRoot: string;
  newRoot: string;
}

export class Blocks {
  blocks: Level<string, Block> = null!;
  latestBlock: Block = null!;

  static async new(storagePath: string): Promise<Blocks> {
    const self = new Blocks();

    self.blocks = new Level(storagePath, { valueEncoding: 'json' });

    try {
      self.latestBlock = await self.blocks.get('latest');
    } catch (error) {
      console.warn('No blocks found. Creating a new chain.');

      self.latestBlock = {
        oldRoot: '0',
        newRoot: '0',
      };

      await self.blocks.put('latest', self.latestBlock);
    }

    return self;
  }

  createNewBlock(): Block {
    return {
      oldRoot: this.latestBlock.newRoot,
      newRoot: '',
    };
  }

  async addBlock(block: Block) {
    await this.blocks.put(block.newRoot, block);
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
    while (this.latestBlock.oldRoot && this.latestBlock.oldRoot !== '0') {
      const block = await this.getBlock(latestBlock.oldRoot);

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
