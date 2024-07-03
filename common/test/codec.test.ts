import { Fr } from '../src/fields';
import { encodeFile, encodeSegment, decodeFile, decodeSegment, bufferToFrElements, frElementsToBuffer } from '../src/codec';

describe('File encoding and decoding', () => {
  const SEGMENT_SIZE = 1 << 10;
  const FIELD_SIZE = 32;
  const CHUNK_SIZE = 31;

  test('encodeFile and decodeFile should be reversible', () => {
    const originalData = new Uint8Array(SEGMENT_SIZE * 2.5); // 2.5 segments
    for (let i = 0; i < originalData.length; i++) {
      originalData[i] = Math.floor(Math.random() * 256);
    }

    const encodedSegments = encodeFile(originalData);
    const decodedData = decodeFile(encodedSegments, originalData.length);

    expect(decodedData).toEqual(originalData);
  });

  test('encodeSegment and decodeSegment should be reversible', () => {
    const originalSegment = new Uint8Array(SEGMENT_SIZE);
    for (let i = 0; i < originalSegment.length; i++) {
      originalSegment[i] = Math.floor(Math.random() * 256);
    }

    const encodedSegment = encodeSegment(originalSegment);
    const decodedSegment = decodeSegment(encodedSegment, originalSegment.length);

    expect(decodedSegment.subarray(0, SEGMENT_SIZE)).toEqual(originalSegment);
  });

  test('bufferToFrElements and frElementsToBuffer should be reversible', () => {
    const originalBuffer = new Uint8Array(FIELD_SIZE * 3);
    for (let i = 0; i < originalBuffer.length; i += FIELD_SIZE) {
      const num = new Fr(BigInt(i)).toBuffer();
      originalBuffer.set(num, i);
    }

    const frElements = bufferToFrElements(originalBuffer);
    const reconstructedBuffer = frElementsToBuffer(frElements);

    expect(reconstructedBuffer).toEqual(originalBuffer);
  });

  test('bufferToFrElements should throw error for invalid buffer size', () => {
    const invalidBuffer = new Uint8Array(FIELD_SIZE - 1); // Not a multiple of FIELD_SIZE
    expect(() => bufferToFrElements(invalidBuffer)).toThrow('Invalid buffer size');
  });


  test('bufferToFrElements should throw error if there are any invalid Fr elements', () => {
    const invalidBuffer = new Uint8Array(FIELD_SIZE * 3);
    for (let i = 0; i < invalidBuffer.length; i += FIELD_SIZE) {
      const num = new Fr(BigInt(i)).toBuffer();
      invalidBuffer.set(num, i);
    }

    invalidBuffer.set(new Uint8Array(FIELD_SIZE).fill(255), 0);

    expect(() => bufferToFrElements(invalidBuffer)).toThrow();

  });

  test('encodeFile should handle empty input', () => {
    const emptyBuffer = new Uint8Array(0);
    const encodedSegments = encodeFile(emptyBuffer);
    expect(encodedSegments).toEqual([]);
  });

  test('decodeFile should handle empty input', () => {
    const emptySegments: Uint8Array[] = [];
    const decodedFile = decodeFile(emptySegments, 0);
    expect(decodedFile).toEqual(new Uint8Array(0));
  });
});
