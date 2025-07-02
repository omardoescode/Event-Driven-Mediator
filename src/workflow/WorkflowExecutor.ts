import type { Workflow } from "./Workflow";
import { v4 as uuid } from "uuid";
import redis_client from "../redis_client";
import type { Kafka, Producer } from "kafkajs";
import type { EventPayload } from "../event/EventPayload";
import type { Step } from "./Step";

export interface IWorkflowExecutor {
  init(flow: Workflow, initiating_event_output: string): Promise<void>;
  continue(
    workflow: Workflow,
    topic: string,
    content: EventPayload,
  ): Promise<void>;
}

interface WorkflowState {
  workflow_id: string;
  name: string;
  status: "In Progress" | "Success" | "Failed";
  steps_output: Record<string, Omit<EventPayload, "workflow_id">>;
  initiated_at: Date;
}

class WorkflowExecutor implements IWorkflowExecutor {
  private kafka_producer: Producer;

  constructor(kafka: Kafka) {
    this.kafka_producer = kafka.producer();
  }
  /**
   * This is executed when the workflow initial event is connected
   * 1. Assign a workflow Id
   * 2. Store the information in redis
   * 3. Execute the events
   */
  public async init(flow: Workflow, initiating_event_output: string) {
    const workflow_id = `workflow:${uuid()}`;
    console.log(`Initiating workflow: ${workflow_id}`);

    const state: WorkflowState = {
      workflow_id,
      name: flow.name,
      status: "In Progress",
      steps_output: {
        [flow.initiating_name]: {
          output: JSON.parse(initiating_event_output),
          success: true,
          timestamp: new Date().toISOString(),
        },
      },
      initiated_at: new Date(),
    };

    await redis_client.set(workflow_id, JSON.stringify(state));

    // Run Ready Events
    await this.kafka_producer.connect();
    await this.run_ready_steps(flow, state);
    await this.kafka_producer.disconnect();
  }

  public async continue(
    workflow: Workflow,
    topic: string,
    content: EventPayload,
  ) {
    const state_str = await redis_client.get(content.workflow_id);
    if (!state_str) {
      console.log(`workflow_id not in DB: ${content.workflow_id}`);
      return;
    }
    const state = JSON.parse(state_str) as WorkflowState;

    const step = workflow.steps.find(
      (s) => s.expected_response_topic === topic,
    );
    if (!step) {
      console.log(`⚠️ No matching step found for topic: ${topic}`);
      return;
    }
    state.steps_output[step.name] = {
      output: content.output,
      success: content.success,
      timestamp: content.timestamp,
    };

    if (!content.success) {
      state.status = "Failed";
      console.log(
        `❌ Step "${step.name}" failed. Marking workflow ${content.workflow_id} as failed.`,
      );
    }

    // Check if everything is done
    const allStepsCompleted = workflow.steps.every(
      (s) => state.steps_output[s.name]?.success,
    );
    if (allStepsCompleted) {
      state.status = "Success";
      console.log(
        `✅ Workflow "${workflow.name}" with id ${content.workflow_id} completed successfully.`,
      );
    }

    await redis_client.set(content.workflow_id, JSON.stringify(state));

    // If something is still missing
    if (state.status === "In Progress") {
      await this.kafka_producer.connect();
      await this.run_ready_steps(workflow, state);
      await this.kafka_producer.disconnect();
    }
  }

  private async run_ready_steps(workflow: Workflow, state: WorkflowState) {
    const done_steps = new Set<string>(Object.keys(state.steps_output));
    for (const step of workflow.steps) {
      const dependency = step.depends_on ?? [];
      const ready =
        !done_steps.has(step.name) &&
        dependency.filter((dep) => !done_steps.has(dep)).length == 0;
      if (!ready) continue;
      console.log(`Initiating ${step.name}`);
      const message = this.parse_input_payload(step, state.steps_output);
      await this.kafka_producer.send({
        topic: step.topic,
        messages: [
          {
            value: JSON.stringify(message),
          },
        ],
      });
    }
  }

  private parse_input_payload(
    step: Step,
    steps_output: Record<string, Omit<EventPayload, "workflow_id">>,
  ): Record<string, any> {
    const input = step.input ?? {};
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(input)) {
      const match = value.match(/^\s*{{\s*(\w+)\.(\w+)\s*}}\s*$/);
      if (match) {
        const [_, stepName, field] = match;
        if (!stepName || !field) {
          throw new Error(
            `Invalid input reference in step "${step.name}" for input "${value}". Expected format: {{stepName.field}}`,
          );
        }
        const output = steps_output[stepName]?.output;
        if (output && field in output) {
          result[key] = output[field];
        } else {
          throw new Error(
            `Cannot resolve input for step "${step.name}": missing output field "${field}" from "${stepName}"`,
          );
        }
      } else {
        throw new Error(`Invalid matching input syntax: ${value}`);
      }
    }

    return result;
  }
}

export default WorkflowExecutor;
