import { Kafka } from "kafkajs";

/**
 * Kafka instance configured for Chimera's event-driven architecture
 * 
 * @example
 * ```typescript
 * const kafka = new Kafka({ brokers: ["localhost:29092"] });
 * ```
 */
const kafka = new Kafka({ brokers: ["localhost:29092"] });

/**
 * Kafka admin client for topic management operations
 */
const admin = kafka.admin();

/**
 * Creates essential Kafka topics for Chimera's sandbox event coordination
 * 
 * This function initializes the event topics required for communication between
 * different components in the Chimera penetration testing system. The topics handle
 * sandbox lifecycle events that coordinate when testing environments are ready.
 * 
 * @returns Promise that resolves when topics are created and metadata is fetched
 * @throws {Error} When Kafka connection fails or topic creation is rejected

 * 
 * @example
 * ```typescript
 * try {
 *   await createTopics();
 *   console.log("Topics created successfully");
 * } catch (error) {
 *   console.error("Failed to create topics:", error);
 * }
 * ```
 */
async function createTopics(): Promise<void> {
  await admin.connect();
  const created = await admin.createTopics({
    topics: [
      { topic: "sandbox-events.created", numPartitions: 1 },
      { topic: "sandbox-events.ready", numPartitions: 1 },
    ],
    waitForLeaders: true,
  });

  const metadata = await admin.fetchTopicMetadata();
  console.log(metadata);
}

createTopics().catch(console.error).finally(admin.disconnect);

