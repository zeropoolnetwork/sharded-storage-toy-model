// Original taken from https://github.com/near/borsh-js
// Added support for configurable endianness, dynamic arrays and replaced BN with bigint.

const textDecoder = new TextDecoder("utf-8", { fatal: true });

export enum Endianness {
  LE = "le",
  BE = "be",
}

/// Binary encoder.
export class BinaryWriter {
  buf: Buffer;
  length: number;
  endian: Endianness;

  public constructor(initialLength = 1024, endian: Endianness = Endianness.BE) {
    this.buf = Buffer.alloc(initialLength);
    this.length = 0;
    this.endian = endian;
  }

  maybeResize() {
    if (this.buf.length < this.length + 64) {
      this.buf = Buffer.concat([this.buf, Buffer.alloc(this.length / 2)]);
    }
  }

  public writeU8(value: number) {
    this.maybeResize();
    this.buf.writeUInt8(value, this.length);
    this.length += 1;
  }

  public writeU16(value: number) {
    this.maybeResize();
    if (this.endian == "le") {
      this.buf.writeUInt16LE(value, this.length);
    } else {
      this.buf.writeUInt16BE(value, this.length);
    }
    this.length += 2;
  }

  public writeU32(value: number) {
    this.maybeResize();
    if (this.endian == "le") {
      this.buf.writeUInt32LE(value, this.length);
    } else {
      this.buf.writeUInt32BE(value, this.length);
    }
    this.length += 4;
  }

  public writeU64(value: number | bigint) {
    this.maybeResize();
    this.writeBuffer(Buffer.from(bigintToArray(value, 8, this.endian)));
  }

  public writeU128(value: number | bigint) {
    this.maybeResize();
    this.writeBuffer(Buffer.from(bigintToArray(value, 16, this.endian)));
  }

  public writeU256(value: number | bigint) {
    this.maybeResize();
    this.writeBuffer(Buffer.from(bigintToArray(value, 32, this.endian)));
  }

  public writeU512(value: number | bigint) {
    this.maybeResize();
    this.writeBuffer(Buffer.from(bigintToArray(value, 64, this.endian)));
  }

  public writeBuffer(buffer: Buffer) {
    buffer.copy(this.buf, this.length);
    this.length += buffer.length;
  }

  public writeDynamicBuffer(buffer: Buffer) {
    this.writeU32(buffer.length);
    this.writeBuffer(buffer);
  }

  public writeString(str: string) {
    this.maybeResize();
    const b = Buffer.from(str, "utf8");
    this.writeU32(b.length);
    this.writeBuffer(b);
  }

  public writeFixedArray(array: Uint8Array) {
    this.writeBuffer(Buffer.from(array));
  }

  public writeArray(array: any[], fn: any) {
    this.maybeResize();
    this.writeU32(array.length);
    for (const elem of array) {
      this.maybeResize();
      fn(elem);
    }
  }

  public toBuffer(): Buffer {
    return this.buf.subarray(0, this.length);
  }
}

function handlingRangeError(originalMethod: Function) {
  return function (this: any, ...args: any[]) {
    try {
      return originalMethod.apply(this, args);
    } catch (e) {
      if (e instanceof RangeError) {
        const code = (e as any).code;
        if (
          ["ERR_BUFFER_OUT_OF_BOUNDS", "ERR_OUT_OF_RANGE"].indexOf(code) >= 0
        ) {
          throw new Error("Reached the end of buffer when deserializing");
        }
      }
      throw e;
    }
  };
}

export class BinaryReader {
  buf: Buffer;
  offset: number;
  endian: Endianness;

  public constructor(buf: Buffer, endian: Endianness = Endianness.BE) {
    this.buf = buf;
    this.offset = 0;
    this.endian = endian;
  }

  readU8 = handlingRangeError(function (this: BinaryReader): number {
    const value = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return value;
  });

  readU16 = handlingRangeError(function (this: BinaryReader): number {
    let value;
    if (this.endian == "le") {
      value = this.buf.readUInt16LE(this.offset);
    } else {
      value = this.buf.readUInt16BE(this.offset);
    }
    this.offset += 2;
    return value;
  });

  readU32 = handlingRangeError(function (this: BinaryReader): number {
    let value;
    if (this.endian == "le") {
      value = this.buf.readUInt32LE(this.offset);
    } else {
      value = this.buf.readUInt32BE(this.offset);
    }
    this.offset += 4;
    return value;
  });

  readU64 = handlingRangeError(function (this: BinaryReader): bigint {
    const buf = this.readBuffer(8);
    return arrayToBigint(buf, this.endian);
  });

  readU128 = handlingRangeError(function (this: BinaryReader): bigint {
    const buf = this.readBuffer(16);
    return arrayToBigint(buf, this.endian);
  });

  readU256 = handlingRangeError(function (this: BinaryReader): bigint {
    const buf = this.readBuffer(32);
    return arrayToBigint(buf, this.endian);
  });

  readI256 = handlingRangeError(function (this: BinaryReader): bigint {
    const buf = this.readBuffer(32);
    return arrayToBigint(buf, this.endian, true);
  });

  readU512 = handlingRangeError(function (this: BinaryReader): bigint {
    const buf = this.readBuffer(64);
    return arrayToBigint(buf, this.endian);
  });

  readUint = handlingRangeError(function (this: BinaryReader, size: number): bigint {
    const buf = this.readBuffer(size);
    return arrayToBigint(buf, this.endian);
  });

  readInt = handlingRangeError(function (this: BinaryReader, size: number): bigint {
    const buf = this.readBuffer(size);
    return arrayToBigint(buf, this.endian, true);
  });

  readBuffer(len: number): Buffer {
    if (this.offset + len > this.buf.length) {
      throw new Error(`Expected buffer length ${len} isn't within bounds`);
    }
    const result = this.buf.slice(this.offset, this.offset + len);
    this.offset += len;
    return result;
  }

  readDynamicBuffer = handlingRangeError(function (this: BinaryReader): Buffer {
    const len = this.readU32();
    return this.readBuffer(len);
  });

  readString = handlingRangeError(function (this: BinaryReader): string {
    const len = this.readU32();
    const buf = this.readBuffer(len);
    try {
      // NOTE: Using TextDecoder to fail on invalid UTF-8
      return textDecoder.decode(buf);
    } catch (e) {
      throw new Error(`Error decoding UTF-8 string: ${e}`);
    }
  });

  readFixedArray = handlingRangeError(function (this: BinaryReader, len: number, fn: any): any[] {
    const result = new Array(len);
    for (let i = 0; i < len; i++) {
      result.push(fn());
    }
    return result;
  });

  readArray = handlingRangeError(function (this: BinaryReader, fn: any): any[] {
    const len = this.readU32();
    const result = Array<any>();
    for (let i = 0; i < len; ++i) {
      result.push(fn());
    }
    return result;
  });

  skip = handlingRangeError(function (this: BinaryReader, len: number) {
    this.offset += len;
    const _ = this.buf[this.offset]; // Check if offset is in bounds
  });

  readBufferUntilEnd = handlingRangeError(function (this: BinaryReader): Buffer | null {
    const len = this.buf.length - this.offset;

    if (len <= 0) {
      return null;
    }

    return this.readBuffer(len);
  });

  isEmpty(): boolean {
    return this.offset === this.buf.length;
  }
}

// The rest of the code (bigintToArray and arrayToBigint functions) remains unchanged

export function bigintToArray(
  num: bigint | number,
  size: number,
  endian: Endianness,
): Uint8Array {
  num = BigInt(num);
  const result = new Uint8Array(size);
  if (endian === Endianness.LE) {
    for (let i = 0; num > BigInt(0); i++) {
      result[i] = Number(num % BigInt(256));
      num = num / BigInt(256);
    }
  } else {
    for (let i = size - 1; num > BigInt(0); i--) {
      result[i] = Number(num % BigInt(256));
      num = num / BigInt(256);
    }
  }
  return result;
}

export function arrayToBigint(
  arr: Uint8Array | Buffer,
  endian: Endianness,
  signed = false,
): bigint {
  let result = BigInt(0);
  if (endian === Endianness.LE) {
    for (let i = arr.length - 1; i >= 0; i--) {
      result = (result << BigInt(8)) + BigInt(arr[i]);
    }
  } else {
    for (let i = 0; i < arr.length; i++) {
      result = (result << BigInt(8)) + BigInt(arr[i]);
    }
  }
  if (signed && (arr[0] & 0x80) !== 0) {
    result -= BigInt(1) << BigInt(arr.length * 8);
  }
  return result;
}
