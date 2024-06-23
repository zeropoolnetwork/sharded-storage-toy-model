import { toBigIntBE } from 'bigint-buffer';
import { Fr } from './fields';

const FIELD_SIZE = Fr.SIZE_IN_BYTES;
const CHUNK_SIZE = 31;

export function encodeData(buffer: Uint8Array): Uint8Array {
  const elements = new Uint8Array(FIELD_SIZE * Math.ceil(buffer.length / CHUNK_SIZE));

  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    const chunk = buffer.subarray(i, i + CHUNK_SIZE);
    const data = new Uint8Array(FIELD_SIZE);
    data.set(chunk, FIELD_SIZE - CHUNK_SIZE);
    const fr = new Fr(chunk);

    elements.set(fr.toBuffer(), i + FIELD_SIZE);
  }

  return elements;
}

export function decodeData(data: Fr[] | Uint8Array): Uint8Array {
  let elements: Fr[];
  if (data instanceof Uint8Array) {
    elements = bufferToFrElements(data);
  } else {
    elements = data;
  }

  const buffer = new Uint8Array(elements.length * CHUNK_SIZE);
  const fileSize = elements.length * CHUNK_SIZE;

  for (let i = 1; i < elements.length; i++) {
    const element = elements[i];
    const chunk = element.toBuffer().subarray(FIELD_SIZE - CHUNK_SIZE);
    buffer.set(chunk, i * CHUNK_SIZE);
  }

  return buffer.subarray(0, Number(fileSize));
}

export function bufferToFrElements(buffer: Uint8Array): Fr[] {
  if (buffer.length % CHUNK_SIZE !== 0) {
    throw new Error('Invalid buffer size');
  }

  const elements = [];

  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    const chunk = buffer.subarray(i, i + CHUNK_SIZE);
    const data = new Uint8Array(FIELD_SIZE);
    data.set(chunk, FIELD_SIZE - CHUNK_SIZE);

    const fr = new Fr(chunk);
    elements.push(fr);
  }

  return elements;
}

export function frElementsToBuffer(elements: Fr[]): Uint8Array {
  const buffer = new Uint8Array(elements.length * CHUNK_SIZE);

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const chunk = element.toBuffer().subarray(FIELD_SIZE - CHUNK_SIZE);
    buffer.set(chunk, i * CHUNK_SIZE);
  }

  return buffer;
}
