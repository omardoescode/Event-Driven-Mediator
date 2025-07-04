import type StateStore from '../../../src/interfaces/StateStore';

export default class MockStateStore<T> implements StateStore<T> {
  private store: Map<string, T> = new Map();
  private keyCounter = 0;

  async get(
    key: string
  ): Promise<{ type: 'success'; data: T } | { type: 'failure'; error: Error }> {
    if (!this.store.has(key)) {
      return { type: 'failure', error: new Error(`Key not found: ${key}`) };
    }
    return { type: 'success', data: this.store.get(key)! };
  }

  async set(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async get_new_key(): Promise<string> {
    this.keyCounter += 1;
    return `mockkey_${this.keyCounter}`;
  }
}
