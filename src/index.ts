import fs from 'fs';
import path from 'path';
import Mediator from './Mediator';
import YAMLWorkflowParser from './workflow/YAMLWorkflowParser';
import RedisStateStore from './state/RedisStateStore';
import { Kafka, logLevel } from 'kafkajs';
import { createClient, type RedisClientType } from 'redis';

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
  console.error('❌ Redis Client Error', err);
});

await redis_client
  .connect()
  .then(() => console.log('[main] Redis Client Connected'));

// Initialize mediator
const mediator = new Mediator({
  kafka,
  failure_registry: {},
  success_registry: {},
  parser_factory: () => new YAMLWorkflowParser(),
  state_store: new RedisStateStore(redis_client),
});

// Initialize shutdown mechanism
const shutdown = async () => {
  console.log("Shutdown/Cleanup Process Began. Don't force close the server");

  await Promise.all([
    mediator.disconnect().then(() => console.log('Consumers Disconnected')),
    redis_client.destroy().then(() => console.log('Redis Client Disconnected')),
  ]);

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
