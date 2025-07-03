/**
 * an interface to a store for values of type `T`
 */
export default interface StateStore<T> {
  /** set value in store associated with key */
  set(key: string, value: T): Promise<void>;
  /** get value in store associated with key */
  get(key: string): Promise<
    | {
        type: 'success';
        data: T;
      }
    | { type: 'failure'; error: Error }
  >;
  /** creates a new key */
  get_new_key(): Promise<string>;
}
