import fs from 'fs';
import path from 'path';
import Mediator from './Mediator';
import YAMLWorkflowParser from './workflow/YAMLWorkflowParser';
import RedisStateStore from './state/RedisStateStore';
import { Kafka, logLevel } from 'kafkajs';
import { createClient, type RedisClientType } from 'redis';
import type ActionRegistry from './workflow/ActionRegistry';
import type StateStore from './interfaces/StateStore';
import { is_number_string } from './util/number';
import { isNumber, isString } from './util/type_guards';

/**
 * Entry point for the Mediator service.
 * Initializes and starts the workflow orchestration system.
 */
const folder_name = './workflows';

// Initialize Kafka
const kafka = new Kafka({
  clientId: 'Mediator',
  brokers: ['localhost:29092'],
  logLevel: logLevel.ERROR, // TODO: Remove this, and find some formatter for this log
});

// Initialize Redis Client
const redis_client: RedisClientType = createClient({
  url: 'redis://localhost:6379',
});

redis_client.on('error', err => {
  console.error('[redis_client] Redis Client Error', err);
});

await redis_client
  .connect()
  .then(() => console.log('[main] Redis Client Connected'))
  .catch(() => {
    console.log('[main] Failed to connect to Redis');
    process.exit(1);
  });

const RetryStore: StateStore<number> = {
  async get(key: string) {
    const value = await redis_client.get(key);
    if (value === null) return { type: 'success', data: 0 };
    if (is_number_string(value))
      return { type: 'failure', error: new Error('[RetryStore] wrong value') };
    return { type: 'success', data: Number.parseInt(value, 10) };
  },
  async set(key: string, value: number) {
    await redis_client.set(key, value.toString());
  },
  async get_new_key() {
    throw new Error('Not implemented');
  },
};

// Type guard utilities

// Initialize Action Registry
const success_registry: ActionRegistry = {
  log: async (_, params) => {
    if (!params || !isString(params.message)) {
      throw new Error('log action requires a string "message" parameter');
    }
    console.log(`[OnSuccess] ${params.message}`);
  },
  log_output: async ctx => {
    console.log('[OnSuccess] Step payload:');
    console.dir(ctx.step.payload, { depth: null });
  },
};

const failure_registry: ActionRegistry = {
  retry: async (ctx, params) => {
    if (!params) {
      throw new Error('retry action requires parameters');
    }

    // Validate max_attempts (can be number or numeric string)
    let maxAttempts;
    if (isNumber(params.max_attempts)) {
      maxAttempts = params.max_attempts;
    } else if (
      isString(params.max_attempts) &&
      is_number_string(params.max_attempts)
    ) {
      maxAttempts = Number.parseInt(params.max_attempts);
    } else {
      throw new Error('max_attempts must be a number or numeric string');
    }

    // Validate action_after_attempts
    if (!isString(params.action_after_attempts)) {
      throw new Error('action_after_attempts must be a string');
    }

    const retry_id = `${ctx.workflow.workflow_id}:${ctx.step.name}`;
    const result = await RetryStore.get(retry_id);

    let retries_so_far;
    if (result.type === 'failure') retries_so_far = 0;
    else retries_so_far = result.data;

    retries_so_far += 1;
    await RetryStore.set(retry_id, retries_so_far);

    if (retries_so_far >= maxAttempts) {
      await ctx.run_handler(params.action_after_attempts, {});
    } else {
      await ctx.retry_step();
    }
  },
  skip: async ctx => {
    ctx.workflow.status = 'Success';
  },
  abort: async __ => {}, // Do nothing, abort is the default behavior
};

// Initialize mediator
const mediator = new Mediator({
  kafka,
  success_registry,
  failure_registry,
  parser_factory: () => new YAMLWorkflowParser(),
  state_store: new RedisStateStore(redis_client),
});

// Initialize shutdown mechanism
let shutdowning = false;
const shutdown = async () => {
  if (shutdowning) return;
  shutdowning = true;
  console.log("Shutdown/Cleanup Process Began. Don't force close the server");

  try {
    redis_client.destroy();
    console.log('Redis Client Disconnected');
  } catch (err) {
    console.log('Redis client already disconnected');
  }

  await mediator.disconnect().then(() => console.log('Consumers Disconnected'));

  console.log('Shutdown/Cleanup Process Ended');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Initialize workflows and run `listen` to run the server
try {
  const files = await fs.promises.readdir(folder_name);

  // Filter only YAML files (optional but recommended)
  const yamlFiles = files.filter(
    file => file.endsWith('.yml') || file.endsWith('.yaml')
  );

  for (const file of yamlFiles) {
    const filePath = path.join(folder_name, file);
    await mediator.init_workflow(filePath);
  }

  await mediator.init_topics();
  await mediator.listen();
} catch (err) {
  console.error(err);
  shutdown();
}
