import type { WorkflowConfig } from "../schemas/WorkflowConfig";
import type { Kafka, Producer } from "kafkajs";
import type { EventPayload } from "../event/EventPayload";
import type { StepConfig } from "../schemas/StepConfig";
import type WorkflowState from "../interfaces/WorkflowState";
import type ActionRegistry from "./ActionRegistry";
import { ValidationPatterns } from "../schemas/common";
import type { StepState } from "../interfaces/WorkflowState";
import type StateStore from "../interfaces/StateStore";

/**
 * Interface defining the core functionality of the workflow executor.
 * Handles the execution and state management of individual workflow instances.
 */
export interface IWorkflowExecutor {
  /**
   * Initializes a new workflow instance.
   * @param {WorkflowConfig} flow - The workflow definition to execute
   * @param {string} initiating_event_output - Initial event data that triggered the workflow
   */
  init(flow: WorkflowConfig, initiating_event_output: string): Promise<void>;

  /**
   * Continues workflow execution after receiving a step response.
   * @param {WorkflowConfig} workflow - The workflow definition being executed
   * @param {string} topic - The Kafka topic that received the response
   * @param {SharedEventPayload} content - The response event payload
   */
  continue(
    workflow: WorkflowConfig,
    topic: string,
    content: EventPayload,
  ): Promise<void>;
}

/**
 * Handles the execution of workflow instances.
 * Manages workflow state in Redis and coordinates step execution through Kafka.
 * @implements {IWorkflowExecutor}
 */
class WorkflowExecutor implements IWorkflowExecutor {
  /** Kafka producer for sending step execution messages */
  private kafka_producer: Producer;

  /** Action registery for success events */
  private success_registry: ActionRegistry;

  /** Action registery for failure events */
  private failure_registry: ActionRegistry;

  /**
   * Creates a new WorkflowExecutor instance.
   * @param {Kafka} kafka - Kafka client instance for message production
   */
  constructor(
    kafka: Kafka,
    private state_store: StateStore<WorkflowState>,
  ) {
    this.kafka_producer = kafka.producer();
    this.success_registry = {};
    this.failure_registry = {};
  }

  /**
   * Initializes a new workflow instance with the given event data.
   * Creates a workflow ID, stores initial state in Redis, and triggers ready steps.
   * @param {WorkflowConfig} flow - The workflow definition to execute
   * @param {string} initiating_event_output - Initial event data that triggered the workflow
   */
  public async init(flow: WorkflowConfig, initiating_event_output: string) {
    const workflow_id = await this.state_store.get_new_key();
    console.log(`Initiating workflow: ${workflow_id}`);

    const state: WorkflowState = {
      workflow_id,
      name: flow.name,
      status: "In Progress",
      steps: {
        [flow.initiating_event.name]: {
          status: "success",
          payload: JSON.parse(initiating_event_output),
          on_failure: { retries: 0 },
        },
      },
      initiated_at: new Date(),
    };

    try {
      // Run Ready Events
      await this.kafka_producer.connect();
      const [steps, promise] = await this.run_ready_steps(flow, state);

      // Save new state for steps marked as ongoing
      for (const step of steps) {
        state.steps[step] = {
          status: "ongoing",
          payload: null,
        };
      }

      // Wait for all runs to finish
      await promise;

      // Save new state
      await this.state_store.set(workflow_id, state);
    } finally {
      await this.kafka_producer.disconnect();
    }
  }

  /**
   * Continues workflow execution after receiving a step response.
   * Updates workflow state and triggers ready steps if workflow is still in progress.
   * @param {WorkflowConfig} workflow - The workflow definition being executed
   * @param {string} topic - The Kafka topic that received the response
   * @param {SharedEventPayload} content - The response event payload
   */
  public async continue(
    workflow: WorkflowConfig,
    topic: string,
    content: EventPayload,
  ) {
    // Validate the topic
    const topic_match = topic.match(ValidationPatterns.TOPIC_REGEX);
    if (!topic_match || topic_match[1] === "execute") {
      console.log(`Invalid topic format: ${topic}`);
      return;
    }
    const status = topic_match[1] as "success" | "failure";

    // find the state
    const { workflow_id } = content;
    const result = await this.state_store.get(workflow_id);
    if (result.type === "failure") {
      console.error(result.error.message);
      return;
    }
    const { data: state } = result;

    // Find the step
    const step = workflow.steps.find(
      (step) =>
        step.response_topic.success.find((test) => topic === test) ||
        step.response_topic.failure.find((test) => topic === test),
    );

    if (!step) {
      console.log(`Unfound step that lists "${topic}" as response`);
      return;
    }

    // Update the step state
    if (!state.steps[step.name]) {
      state.steps[step.name] = {
        status: status,
        payload: content,
        on_failure: { retries: 0 },
      };
    } else {
      state.steps[step.name]!.status = status;
      state.steps[step.name]!.payload = content;
    }

    // Prepare action context
    const stepState = state.steps[step.name];
    const actionContext = {
      workflow_id: state.workflow_id,
      workflow_name: state.name,
      step_name: step.name,
      step_output:
        stepState && typeof stepState.payload !== "undefined"
          ? stepState.payload
          : {},
      state,
    };

    // Run step handlers
    console.log("Running handlers");
    this.run_handlers(status, step, actionContext);

    // Check for completion
    const allStepsCompleted = workflow.steps.every(
      (s) => state.steps[s.name]?.status === "success",
    );
    if (allStepsCompleted) {
      state.status = "Success";
      console.log(
        `✅ Workflow "${workflow.name}" with id ${workflow_id} completed successfully.`,
      );
    } else if (status === "failure") {
      state.status = "Failed";
      console.log(
        `❌ Step "${step.name}" failed. Marking workflow ${workflow_id} as failed.`,
      );
    }

    // Trigger next steps if still in progress
    if (state.status === "In Progress") {
      try {
        // Run Ready Events
        await this.kafka_producer.connect();
        const [steps, promise] = await this.run_ready_steps(workflow, state);

        // Save new state for steps marked as ongoing
        for (const step of steps) {
          state.steps[step] = {
            status: "ongoing",
            payload: null,
          };
        }

        // Wait for all runs to finish
        await promise;

        // Save new state
        await this.state_store.set(workflow_id, state);
      } finally {
        await this.kafka_producer.disconnect();
      }
    }

    // Persist the updated state
    await this.state_store.set(workflow_id, state);
  }

  /**
   * Executes all workflow steps that are ready to run based on dependency resolution.
   * Sends corresponding messages to Kafka for each ready step.
   *
   * @param workflow - The workflow configuration containing all steps
   * @param state - The current execution state of the workflow
   * @returns A tuple:
   *  - An array of step names that were executed
   *  - A Promise that resolves when all messages have been sent
   * @private
   */
  private async run_ready_steps(
    workflow: WorkflowConfig,
    state: WorkflowState,
  ): Promise<[string[], Promise<void>]> {
    // Collect all steps that are marked as successfully completed
    const done_steps = new Set<string>(
      Object.keys(state.steps).filter(
        (k) => state.steps[k]?.status === "success",
      ),
    );

    // Identify steps that are not yet done and whose dependencies are all satisfied
    const ready_steps = workflow.steps.filter(
      (step) =>
        !done_steps.has(step.name) &&
        (!step.depends_on ||
          step.depends_on.every((dep) => done_steps.has(dep))),
    );

    // Create a promise that sends all the ready steps asynchronously
    const promise = (async () => {
      const promises = [];
      for (const step of ready_steps) {
        const message = this.parse_input_payload(step, state.steps);
        const p = this.kafka_producer.send({
          topic: step.topic,
          messages: [{ value: JSON.stringify(message) }],
        });
        promises.push(p);
      }
      await Promise.all(promises);
    })();

    return [ready_steps.map((step) => step.name), promise] as const;
  }

  /**
   * Parses input payload for a step, resolving template variables from previous step outputs.
   * @param {StepConfig} step - The step whose input needs to be parsed
   * @param {Record<string, any>} steps - Outputs from previous steps
   * @returns {Record<string, any>} Parsed input payload for the step
   * @throws {Error} If input references are invalid or cannot be resolved
   * @private
   */
  private parse_input_payload(
    step: StepConfig,
    steps: Record<string, StepState>,
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
        const stepState = steps[stepName];
        console.log(
          `[parse_input_payload] stepName=${stepName}, field=${field}`,
        );
        console.log(`[parse_input_payload] stepState:`, stepState);
        const payload = stepState?.payload;
        console.log(`[parse_input_payload] payload:`, payload);
        const output = payload?.output;
        console.log(`[parse_input_payload] output:`, output);
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

  private run_handlers(
    status: "success" | "failure",
    step: StepConfig,
    context: any,
  ) {
    const registry =
      status === "success" ? this.success_registry : this.failure_registry;
    console.log(step.on_success);
    console.log(step.on_failure);
    console.log(`[run_handlers] status=${status}, step=${step.name}`);
    if (status === "success" && Array.isArray(step.on_success)) {
      for (const actionObj of step.on_success) {
        console.log(`[run_handlers] Processing action:`, actionObj);
        const handler = registry[actionObj.action];
        if (handler) {
          handler(context, actionObj);
        } else {
          console.warn(
            `[run_handlers] No handler registered for action: ${actionObj.action}`,
          );
        }
      }
    } else if (
      status === "failure" &&
      step.on_failure &&
      step.on_failure.action
    ) {
      console.log(`[run_handlers] Processing failure action:`, step.on_failure);
      const handler = registry[step.on_failure.action];
      if (handler) {
        handler(context, step.on_failure);
      } else {
        console.warn(
          `[run_handlers] No handler registered for action: ${step.on_failure.action}`,
        );
      }
    } else {
      console.warn(
        `[run_handlers] No actions to process for status=${status}, step=${step.name}`,
      );
    }
  }
}

export default WorkflowExecutor;
