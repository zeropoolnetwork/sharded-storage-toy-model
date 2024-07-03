import { Fr } from './fields';

export const FIELD_SIZE = 32;
export const CHUNK_SIZE = 31;
// TODO: Extract settings from crypto-sdk to common
// According to settings in the crypto-sdk
export const SEGMENT_SIZE = 1 << 10;

export function encodeFile(buffer: Uint8Array): Uint8Array[] {
  const segments = [];
  const numSegments = Math.ceil(buffer.length / SEGMENT_SIZE);

  for (let i = 0; i < numSegments; i++) {
    const start = i * SEGMENT_SIZE;
    const end = Math.min((i + 1) * SEGMENT_SIZE, buffer.length);
    const segment = buffer.subarray(start, end);
    segments.push(encodeSegment(segment));
  }

  return segments;
}

export function decodeFile(segments: Uint8Array[], fileSize: number): Uint8Array {
  const buffer = new Uint8Array(fileSize);

  for (let i = 0; i < segments.length; i++) {
    const segment = decodeSegment(segments[i], i === segments.length - 1 ? fileSize % SEGMENT_SIZE : SEGMENT_SIZE);
    buffer.set(segment, i * SEGMENT_SIZE);
  }

  return buffer;
}

export function encodeSegment(buffer: Uint8Array): Uint8Array {
  const elements = new Uint8Array(FIELD_SIZE * Math.ceil(buffer.length / CHUNK_SIZE));

  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    const chunk = buffer.subarray(i, i + CHUNK_SIZE);
    const buf = new Uint8Array(FIELD_SIZE);
    buf.set(chunk, 1);

    elements.set(buf, i / CHUNK_SIZE * FIELD_SIZE);
  }

  return elements;
}

export function decodeSegment(data: Fr[] | Uint8Array, size: number): Uint8Array {
  let elements: Fr[];
  if (data instanceof Uint8Array) {
    if (data.length % FIELD_SIZE !== 0) {
      throw new Error('Invalid buffer size');
    }

    elements = bufferToFrElements(data);
  } else {
    elements = data;
  }

  const buffer = new Uint8Array(elements.length * CHUNK_SIZE);

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i].toBuffer();
    const chunk = element.subarray(1, FIELD_SIZE);
    buffer.set(chunk, i * CHUNK_SIZE);
  }

  return buffer.subarray(0, size);
}

/** Convert a buffer of Fr elements to Fr[] */
export function bufferToFrElements(buffer: Uint8Array): Fr[] {
  if (buffer.length % FIELD_SIZE !== 0) {
    throw new Error('Invalid buffer size');
  }

  const elements = [];

  for (let i = 0; i < buffer.length; i += FIELD_SIZE) {
    const chunk = buffer.subarray(i, i + FIELD_SIZE);
    const fr = new Fr(chunk);
    elements.push(fr);
  }

  return elements;
}

/** Convert Fr elements to a buffer */
export function frElementsToBuffer(elements: Fr[]): Uint8Array {
  const buffer = new Uint8Array(elements.length * FIELD_SIZE);

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i].toBuffer();
    buffer.set(element, i * FIELD_SIZE);
  }

  return buffer;
}
