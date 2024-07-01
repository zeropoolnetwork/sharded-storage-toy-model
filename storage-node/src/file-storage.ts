import fs from 'fs/promises';
import * as path from 'path';
import { Level } from 'level';

export interface FileMetadata {
  /// Until when was it paid for
  expiration_time: number;
  // /// Who owns it (and has the right to delete/modify).
  // /// `owner == 0` means that the file was erased
  // owner: bigint,
  // /// Merkle Root of the data
  // data: bigint,
}

export class FileStorage {
  private segmentSize: number = 2 ** 10;
  private fileDirectory: string = './files';

  private constructor() { }

  static async new(
    segmentSize: number = 2 ** 10,
    fileDirectory: string = './data/files',
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
