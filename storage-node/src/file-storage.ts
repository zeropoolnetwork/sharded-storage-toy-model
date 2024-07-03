import fs from 'fs/promises';
import * as path from 'path';
import { Level } from 'level';
import { defShardedStorageSettings } from 'zpst-crypto-sdk/src/settings';

const DEFAULT_SEGMENT_SIZE = (1 << defShardedStorageSettings.file_tree_depth) * 32;

export class FileStorage {
  private segmentSize: number = DEFAULT_SEGMENT_SIZE;
  private fileDirectory: string = './files';

  private constructor() { }

  static async new(
    fileDirectory: string = './data/files',
    segmentSize: number = DEFAULT_SEGMENT_SIZE,
  ): Promise<FileStorage> {
    const self = new FileStorage();

    self.segmentSize = segmentSize;
    self.fileDirectory = fileDirectory;

    if (!(await fileExists(fileDirectory))) {
      await fs.mkdir(fileDirectory, { recursive: true });
    }

    return self;
  }

  // async reserve(segmentId: string, metadata: FileMetadata) {
  //   const metaFilePath = this.getMetaFilePath(segmentId);
  //   const data = JSON.stringify(metadata);

  //   await fs.writeFile(metaFilePath, data);
  // }

  // TODO: Check expiration and hash/signature
  async write(segmentId: string, data: Buffer) {
    if (data.length > this.segmentSize) {
      throw new Error('File size exceeds cluster size');
    }

    const filePath = this.getFilePath(segmentId);
    await fs.writeFile(filePath, data);

    // const metaFilePath = this.getMetaFilePath(segmentId);
    // const metadataData = JSON.stringify(metadata);
    // await fs.writeFile(metaFilePath, metadataData);
  }

  async read(fileName: string): Promise<Buffer | null> {
    const filePath = this.getFilePath(fileName);

    if (!(await fileExists(filePath))) {
      return null;
    }

    const data = await fs.readFile(filePath);

    return data;
  }

  private getFilePath(segmentId: string): string {
    return path.join(this.fileDirectory, segmentId);
  }

  private getMetaFilePath(segmentId: string): string {
    return path.join(this.fileDirectory, `${segmentId}.meta.json`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}
