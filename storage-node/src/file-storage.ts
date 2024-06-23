import fs from 'fs/promises';
import * as path from 'path';
import { Level } from 'level';

export class FileStorage {
  private segmentSize: number = 2 ** 10;
  private fileDirectory: string = './files';

  private constructor() { }

  static async new(segmentSize: number = 2 ** 10, fileDirectory: string = './data/files'): Promise<FileStorage> {
    const self = new FileStorage();

    self.segmentSize = segmentSize;
    self.fileDirectory = fileDirectory;

    if (!await fileExists(fileDirectory)) {
      await fs.mkdir(fileDirectory, { recursive: true });
    }

    return self;
  }

  async write(segmentId: string, data: Buffer) {
    const filePath = this.getFilePath(segmentId);

    if (data.length > this.segmentSize) {
      throw new Error('File size exceeds cluster size');
    }

    await fs.writeFile(filePath, data);
  }

  async read(fileName: string): Promise<Buffer | undefined> {
    const filePath = this.getFilePath(fileName);

    if (!(await fs.stat(filePath))) {
      return undefined;
    }

    const data = await fs.readFile(filePath);

    return data;
  }

  private getFilePath(segmentId: string): string {
    return path.join(this.fileDirectory, segmentId);
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
