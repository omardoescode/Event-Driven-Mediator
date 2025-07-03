import type { RedisClientType } from 'redis';
import type StateStore from '../interfaces/StateStore';
import type WorkflowState from '../interfaces/WorkflowState';
import { v4 as uuid } from 'uuid';

class RedisStateStore implements StateStore<WorkflowState> {
  constructor(private client: RedisClientType) {}
  async get(key: string) {
    const state_str = await this.client.get(key);
    if (!state_str)
      return {
        type: 'failure' as const,
        error: new Error(`key not found in RedisStateStore: ${key}`),
      };

    const state = JSON.parse(state_str) as WorkflowState;
    return { type: 'success' as const, data: state };
  }
  async set(key: string, value: WorkflowState) {
    await this.client.set(key, JSON.stringify(value));
  }
  async get_new_key() {
    const workflow_id = `workflow:${uuid()}`;
    return workflow_id;
  }
}

export default RedisStateStore;
