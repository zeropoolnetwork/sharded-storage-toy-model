import fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Level } from 'level';

export interface FileMetadata {
  ownerId: string;
  expirationDate: Date;
  // Size in bytes. Might be needed if we want to restore the data from Fr[]. For now, files are stored as is.
  size: number;
}

export class FileStorage {
  private clusterSize: number = 0;
  private fileDirectory: string = '';
  // private reservedFiles: Level<string, Date>;

  static async new(clusterSize: number = 1024 * 128, fileDirectory: string = './files'): Promise<FileStorage> {
    const self = new FileStorage();

    self.clusterSize = clusterSize;
    self.fileDirectory = fileDirectory;
    // this.reservedFiles = new Level('reserved-files', { valueEncoding: 'json' });

    if (!await fileExists(fileDirectory)) {
      await fs.mkdir(fileDirectory, { recursive: true });
    }

    return self;
  }

  private getFilePath(fileName: string): string {
    return path.join(this.fileDirectory, fileName);
  }

  // TODO: Only supports files that fit into a single cluster for now.
  async reserve(fileName: string, metadata: FileMetadata): Promise<string> {
    let filePath: string;

    // Create a new file if no expired files are found
    filePath = this.getFilePath(fileName);
    const buffer = Buffer.alloc(this.clusterSize);
    await fs.writeFile(filePath, buffer);
    await fs.writeFile(`${filePath}.meta`, JSON.stringify(metadata));
    // await this.reservedFiles.put(fileName, metadata.expirationDate);

    return fileName;
  }

  async write(fileName: string, buffer: Buffer) {
    const filePath = this.getFilePath(fileName);

    if (buffer.length > this.clusterSize) {
      throw new Error('File size exceeds cluster size');
    }

    if (!await fileExists(filePath)) {
      throw new Error('File not reserved');
    }

    await fs.writeFile(filePath, buffer);
  }

  async read(fileName: string): Promise<Buffer | undefined> {
    const filePath = this.getFilePath(fileName);

    if (!(await fs.stat(filePath))) {
      return undefined;
    }

    const data = await fs.readFile(filePath);

    return data;
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
