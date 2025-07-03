import type { WorkflowConfig } from './schemas/WorkflowConfig';
import { Kafka, logLevel, type Consumer } from 'kafkajs';
import WorkflowExecutor, {
  type WorkflowExecutorConfig,
} from './workflow/WorkflowExecutor';
import { EventPayloadSchema } from './event/EventPayload';
import type { WorkflowParser } from './interfaces/WorkflowParser';
import type StateStore from './interfaces/StateStore';
import type WorkflowState from './interfaces/WorkflowState';
import type ActionRegistry from './workflow/ActionRegistry';

/**
 * Interface defining the core functionality of the Mediator service.
 * Handles workflow initialization, topic management, and event listening.
 */
export interface IMediator {
  init_workflow(file_name: string): Promise<void>;
  init_topics(flows: WorkflowConfig[]): Promise<void>;
  listen(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface MediatorConfig {
  parser_factory: () => WorkflowParser;
  state_store: StateStore<WorkflowState>;
  success_registry: ActionRegistry;
  failure_registry: ActionRegistry;
}

/**
 * Main mediator class that orchestrates workflow execution and event handling.
 * Manages Kafka consumers and workflow state across the system.
 * @param {MediatorConfig} config - Configuration object with parser_factory, state_store, success_registry, and failure_registry.
 */
class Mediator implements IMediator {
  /** Map of workflow objects indexed by their initiating Kafka topic */
  private workflows: Map<string, WorkflowConfig> = new Map();

  /** Main Kafka client instance */
  private kafka: Kafka;

  /** Map of Kafka consumers indexed by their topic names */
  private consumers: Map<string, Consumer> = new Map();

  /** config for executors */
  private executor_config: WorkflowExecutorConfig;

  /** factory method for workflow parsers */
  private parser_factory: () => WorkflowParser;

  /**
   * Creates a new Mediator instance.
   * @param {MediatorConfig} config - Configuration object with parser_factory, state_store, success_registry, and failure_registry.
   */
  constructor({
    parser_factory,
    state_store,
    success_registry,
    failure_registry,
  }: MediatorConfig) {
    this.kafka = new Kafka({
      clientId: 'Mediator',
      brokers: ['localhost:29092'],
      logLevel: logLevel.ERROR, // TODO: Remove this, and find some formatter for this log
    });
    this.parser_factory = parser_factory;
    this.executor_config = {
      state_store,
      kafka: this.kafka,
      success_registry,
      failure_registry,
    };
  }

  /**
   * Initializes a workflow by reading and parsing workflow definition file
   * @param {string} file_name - Path to the file containing the workflow definition
   * @throws {Error} If workflow parsing fails
   * @returns {Promise<void>}
   */
  public async init_workflow(file_name: string): Promise<void> {
    const parser = this.parser_factory();
    try {
      const workflow = await parser.parse_workflow(file_name);
      this.workflows.set(workflow.initiating_event.topic, workflow);
    } catch (err) {
      console.log(`Failed to load workflow: ${file_name}`);
      if (err instanceof Error) console.log(err.message);
    }
  }

  /**
   * Initializes Kafka topics required by all workflows.
   * Creates missing topics if they don't exist.
   * @returns {Promise<void>}
   */
  public async init_topics(): Promise<void> {
    const admin = this.kafka.admin();
    try {
      await admin.connect();

      const topic_metadata = await admin.fetchTopicMetadata();
      const existing_topics = new Set(topic_metadata.topics.map(t => t.name));
      const all: Set<string> = new Set();

      for (const flow of this.workflows.values()) {
        all.add(flow.initiating_event.topic);
        for (const step of flow.steps) {
          all.add(step.topic);
          for (const topic_response of step.response_topic.success)
            all.add(topic_response);
          for (const topic_response of step.response_topic.failure)
            all.add(topic_response);
        }
      }

      const missing = [...all].filter(topic => !existing_topics.has(topic));

      if (missing.length == 0) console.log('All Kafka topics already exist');
      else
        await admin.createTopics({
          topics: missing.map(t => ({
            topic: t,
            numPartitions: 2,
            replicationFactor: 1,
          })),
        });
    } finally {
      await admin.disconnect();
    }
  }

  /**
   * Starts listening for events on all workflow-related Kafka topics.
   * Sets up consumers for both initiating and response topics.
   * @returns {Promise<void>}
   */
  public async listen(): Promise<void> {
    const ps = [];

    // Listen for initiating events
    for (const [topic, workflow] of this.workflows.entries()) {
      const promise = async () => {
        console.log(`Consumer ${topic} Initialization began`);
        const consumer = this.kafka.consumer({ groupId: `mediator-${topic}` });
        await consumer.connect();
        await consumer.subscribe({ topic, fromBeginning: false });
        await consumer.run({
          eachMessage: async ({ topic, message }) => {
            const content = message.value?.toString();
            if (!content) return;
            console.log(`📨 Received message on ${topic}: ${content}`);
            const executor = new WorkflowExecutor(this.executor_config);
            executor.init(workflow, content);
          },
        });
        this.consumers.set(topic, consumer);
        console.log(`Consumer ${topic} Initialization ended`);
      };
      ps.push(promise());
    }

    // Listen for all response topics (success and failure) for each step
    for (const workflow of this.workflows.values()) {
      const response_topics = workflow.steps.flatMap(step => [
        ...step.response_topic.success,
        ...step.response_topic.failure,
      ]);
      console.log(response_topics);
      for (const topic of response_topics) {
        const promise = async () => {
          console.log(`Consumer ${topic} Initialization began`);
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
              const payload = parsed.data;
              console.log(`📨 Received message on ${topic}: ${content}`);
              const executor = new WorkflowExecutor(this.executor_config);
              executor.continue(workflow, topic, payload);
            },
          });

          console.log(`Consumer ${topic} Initialization ended`);
          this.consumers.set(topic, consumer);
        };
        ps.push(promise());
      }
    }
    await Promise.all(ps);
  }

  /**
   * Gracefully disconnects all Kafka consumers
   * @returns {Promise<void>}
   */
  public async disconnect(): Promise<void> {
    await Promise.all(
      [...this.consumers.values()].map((c, idx) =>
        c.disconnect().then(() => console.log(`Consumer ${idx} disconnected`))
      )
    );
  }
}

export default Mediator;
