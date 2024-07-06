import { writable, type Writable } from 'svelte/store';

export const error: Writable<string | null> = writable(null);

export function showError(msg: string) {
  error.set(msg);
}

export function hideError() {
  error.set(null);
}