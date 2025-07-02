import fs from "fs";
import path from "path";
import type { Workflow } from "./workflow/Workflow";
import { Kafka, logLevel, type Consumer } from "kafkajs";
import WorkflowExecutor from "./workflow/WorkflowExecutor";
import { EventPayloadSchema } from "./event/EventPayload";
import type { WorkflowParser } from "./workflow/WorkflowParser";

export interface IMediator {
  init_workflows(dir_path: string): Promise<void>;
  init_topics(flows: Workflow[]): Promise<void>;
  listen(): Promise<void>;
  disconnect(): Promise<void>;
}

class Mediator implements IMediator {
  private workflows_by_initiating_topic: Map<string, Workflow> = new Map();
  private kafka: Kafka;
  private consumers: Map<string, Consumer> = new Map();

  constructor(private readonly parserFactory: () => WorkflowParser) {
    this.kafka = new Kafka({
      clientId: "Mediator",
      brokers: ["localhost:29092"],
      logLevel: logLevel.ERROR, // TODO: Remove this, and find some formatter for this log
    });

    // Close all consumers automatically
    process.on("SIGINT", async () => {
      this.disconnect();
    });
  }

  public async init_workflows(dir_path: string): Promise<void> {
    const files = await fs.promises.readdir(dir_path);

    for (const file of files) {
      const full_path = path.join(dir_path, file);
      const parser = this.parserFactory();

      try {
        const workflow = await parser.parse_workflow(full_path);
        this.workflows_by_initiating_topic.set(
          workflow.initiating_topic,
          workflow,
        );
        console.log(workflow.initiating_topic);
      } catch (err) {
        console.log(`Failed to load workflow: ${full_path}`);
        if (err instanceof Error) console.log(err.message);
      }
    }
  }

  public async init_topics(): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();

    const topic_metadata = await admin.fetchTopicMetadata();
    const existing_topics = new Set(topic_metadata.topics.map((t) => t.name));
    const all: Set<string> = new Set();

    for (const flow of this.workflows_by_initiating_topic.values()) {
      all.add(flow.initiating_topic);

      for (const step of flow.steps) {
        all.add(step.topic);
        if (step.expected_response_topic) all.add(step.expected_response_topic);
      }
    }

    const missing = [...all].filter((topic) => !existing_topics.has(topic));

    if (missing.length == 0) console.log("All Kafka topics already exist");
    else
      await admin.createTopics({
        topics: missing.map((t) => ({
          topic: t,
          numPartitions: 1,
          replicationFactor: 1,
        })),
      });
    await admin.disconnect();
  }

  public async listen(): Promise<void> {
    for (const [
      topic,
      workflow,
    ] of this.workflows_by_initiating_topic.entries()) {
      const consumer = this.kafka.consumer({ groupId: `mediator-${topic}` });

      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });

      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          const content = message.value?.toString();
          if (!content) return;

          console.log(`📨 Received message on ${topic}: ${content}`);

          const executor = new WorkflowExecutor(this.kafka);
          executor.init(workflow, content);
        },
      });

      this.consumers.set(topic, consumer);
    }

    for (const workflow of this.workflows_by_initiating_topic.values()) {
      const topics = workflow.steps.flatMap((s) =>
        s.expected_response_topic ? [s.expected_response_topic] : [],
      );

      for (const topic of topics) {
        const consumer = this.kafka.consumer({
          groupId: `mediator-${topic}`,
        });
        await consumer.connect();
        await consumer.subscribe({
          topic,
          fromBeginning: false,
        });

        await consumer.run({
          eachMessage: async ({ topic, message }) => {
            const content = message.value?.toString();
            if (!content) return;
            const parsed = EventPayloadSchema.safeParse(JSON.parse(content));

            if (!parsed.success) {
              console.log(`Invalid event payload: ${content}`);
              return;
            }

            console.log(`📨 Received message on ${topic}: ${content}`);

            const executor = new WorkflowExecutor(this.kafka);
            executor.continue(workflow, topic, parsed.data);
          },
        });

        this.consumers.set(topic, consumer);
      }
    }
  }

  public async disconnect(): Promise<void> {
    console.log("Disconnecting consumers...");
    await Promise.all([...this.consumers.values()].map((c) => c.disconnect()));
    process.exit(0);
  }
}

export default Mediator;
