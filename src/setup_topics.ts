import { Kafka } from "kafkajs";

const kafka = new Kafka({ brokers: ["localhost:29092"] });
const admin = kafka.admin();

async function createTopics() {
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

