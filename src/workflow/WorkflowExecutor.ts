import type { WorkflowConfig } from '../schemas/WorkflowConfig';
import type { Kafka, Producer } from 'kafkajs';
import type { EventPayload } from '../event/EventPayload';
import type { StepConfig } from '../schemas/StepConfig';
import type WorkflowState from '../interfaces/WorkflowState';
import type ActionRegistry from './ActionRegistry';
import type { ActionContext } from './ActionRegistry';
import { ValidationPatterns } from '../schemas/common';
import type StepState from '../interfaces/StepState';
import type StateStore from '../interfaces/StateStore';

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
   * @param {EventPayload} content - The response event payload
   */
  continue(
    workflow: WorkflowConfig,
    topic: string,
    content: EventPayload
  ): Promise<void>;
}

export interface WorkflowExecutorConfig {
  kafka: Kafka;
  state_store: StateStore<WorkflowState>;
  success_registry: ActionRegistry;
  failure_registry: ActionRegistry;
}

/**
 * Handles the execution of workflow instances.
 * Manages workflow state in Redis and coordinates step execution through Kafka.
 */
class WorkflowExecutor implements IWorkflowExecutor {
  /** Kafka producer for sending step execution messages */
  private kafka_producer: Producer;

  /** Action registery for success events */
  private success_registry: ActionRegistry;

  /** Action registery for failure events */
  private failure_registry: ActionRegistry;

  /** Store for workflows */
  private state_store: StateStore<WorkflowState>;

  /**
   * Creates a new WorkflowExecutor instance.
   * @param {WorkflowExecutorConfig} config - The mediator config
   */
  constructor(config: WorkflowExecutorConfig) {
    this.kafka_producer = config.kafka.producer();
    this.state_store = config.state_store;
    this.success_registry = config.success_registry;
    this.failure_registry = config.failure_registry;
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

    // Wrap the initial event data in the EventPayload structure
    const initialPayload: EventPayload = {
      workflow_id,
      timestamp: new Date().toISOString(),
      success: true,
      output: JSON.parse(initiating_event_output),
    };

    const state: WorkflowState = {
      workflow_id,
      name: flow.name,
      status: 'In Progress',
      steps: {
        [flow.initiating_event.name]: {
          name: flow.initiating_event.name,
          status: 'success',
          payload: initialPayload,
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
          name: step,
          status: 'ongoing',
          payload: null,
        };
      }

      // Wait for all runs to finish
      await promise;

      // Print the initial state
      console.dir(state);

      // Save new state
      await this.state_store.set(workflow_id, state);
    } finally {
      await this.kafka_producer.disconnect();
    }
  }

  /**
   * Continues workflow execution after receiving a step response.
   * Updates workflow state and triggers ready steps if workflow is still in progress.
   * @param {WorkflowConfig} workflow_config - The workflow definition being executed
   * @param {string} topic - The Kafka topic that received the response
   * @param {EventPayload} content - The response event payload
   */
  public async continue(
    workflow_config: WorkflowConfig,
    topic: string,
    content: EventPayload
  ) {
    // Validate the topic
    const topic_match = topic.match(ValidationPatterns.TOPIC_REGEX);
    if (!topic_match || topic_match[1] === 'execute') {
      console.log(`Invalid topic format: ${topic}`);
      return;
    }
    const status = topic_match[1] as 'success' | 'failure';

    // find the state
    const { workflow_id } = content;
    console.log(`Continuing with workflow ${workflow_id}`);
    const result = await this.state_store.get(workflow_id);
    if (result.type === 'failure') {
      console.error(result.error.message);
      return;
    }
    const workflow_state = result.data;

    // Find the step
    const step = workflow_config.steps.find(
      step =>
        step.response_topic.success.find(test => topic === test) ||
        step.response_topic.failure.find(test => topic === test)
    );

    if (!step) {
      console.log(`Unfound step that lists "${topic}" as response`);
      return;
    }

    // This means that the step has already been marked a failure or a success
    // So we have dont this before
    if (workflow_state.steps[step.name]?.status !== 'ongoing') {
      console.log(`Step has already fired`);
      return;
    }

    // Update the step state
    workflow_state.steps[step.name] = {
      name: step.name,
      status: status,
      payload: content,
    };

    // Prepare action context
    const stepState = workflow_state.steps[step.name] as StepState; // We are sure since we assigned it above
    const self = this;
    const actionContext: ActionContext = {
      workflow: workflow_state, // WorkflowState
      step: stepState, // StepState
      async retry_step() {
        // Mark the step as ongoing and re-send the message for this step
        workflow_state.steps[step.name] = {
          name: step.name,
          status: 'ongoing',
          payload: null,
        };
        await self.state_store.set(workflow_id, workflow_state);
        await self.kafka_producer.connect();
        const message = self.parse_input_payload(step, workflow_state.steps);
        await self.kafka_producer.send({
          topic: step.topic,
          messages: [{ value: JSON.stringify(message) }],
        });
        await self.kafka_producer.disconnect();
      },
      async run_handler(action, params) {
        // Find the handler in the appropriate registry and run it
        const handler = self.failure_registry[action];
        if (handler) {
          await handler(this, params);
        } else {
          console.warn(
            `[ActionContext] No handler registered for action: ${action}`
          );
        }
      },
    };

    // Check for completion
    const allStepsCompleted = !workflow_config.steps.find(
      s => workflow_state.steps[s.name]?.status === 'ongoing'
    );
    if (allStepsCompleted) {
      workflow_state.status = 'Success';
      console.log(
        `✅ Workflow "${workflow_config.name}" with id ${workflow_id} completed successfully.`
      );
    } else if (status === 'failure') {
      workflow_state.status = 'Failed';
      console.log(
        `❌ Step "${step.name}" failed. Marking workflow ${workflow_id} as failed.`
      );
    }

    // Trigger next steps if still in progress
    if (workflow_state.status === 'In Progress') {
      try {
        // Run Ready Events
        await this.kafka_producer.connect();
        const [steps, promise] = await this.run_ready_steps(
          workflow_config,
          workflow_state
        );

        // Save new state for steps marked as ongoing
        for (const step of steps) {
          workflow_state.steps[step] = {
            name: step,
            status: 'ongoing',
            payload: null,
          };
        }

        // Wait for all runs to finish
        await promise;

        // Run step handlers
        console.log(`[workflow: ${workflow_id}] Running handlers`);
        this.run_handlers(status, step, actionContext);

        // Save new state
        await this.state_store.set(workflow_id, workflow_state);
      } finally {
        await this.kafka_producer.disconnect();
      }
    }

    // Persist the updated state
    await this.state_store.set(workflow_id, workflow_state);
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
    state: WorkflowState
  ): Promise<[string[], Promise<void>]> {
    // Collect all steps that are marked as successfully completed
    const done_steps = new Set<string>(
      Object.keys(state.steps).filter(k => state.steps[k]?.status === 'success')
    );

    // Identify steps that are not yet done and whose dependencies are all satisfied
    const ready_steps = workflow.steps.filter(
      step =>
        !done_steps.has(step.name) &&
        (!step.depends_on || step.depends_on.every(dep => done_steps.has(dep)))
    );

    // Create a promise that sends all the ready steps asynchronously
    const promise = (async () => {
      const promises = [];
      for (const step of ready_steps) {
        const message = this.parse_input_payload(step, state.steps);
        console.log(`[run_ready_steps] Sending to topic: ${step.topic}`);
        const p = this.kafka_producer.send({
          topic: step.topic,
          messages: [{ value: JSON.stringify(message) }],
        });
        promises.push(p);
      }
      await Promise.all(promises);
    })();

    return [ready_steps.map(step => step.name), promise] as const;
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
    steps: Record<string, StepState>
  ): Record<string, any> {
    const input = step.input ?? {};
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(input)) {
      const match = value.match(/^\s*{{\s*(\w+)\.(\w+)\s*}}\s*$/);
      if (match) {
        const [_, stepName, field] = match;
        if (!stepName || !field) {
          throw new Error(
            `Invalid input reference in step "${step.name}" for input "${value}". Expected format: {{stepName.field}}`
          );
        }
        const stepState = steps[stepName];
        console.log(
          `[parse_input_payload] stepName=${stepName}, field=${field}`
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
            `Cannot resolve input for step "${step.name}": missing output field "${field}" from "${stepName}"`
          );
        }
      } else {
        throw new Error(`Invalid matching input syntax: ${value}`);
      }
    }

    return result;
  }

  private run_handlers(
    status: 'success' | 'failure',
    step: StepConfig,
    context: any
  ) {
    const registry =
      status === 'success' ? this.success_registry : this.failure_registry;
    console.log(step.on_success);
    console.log(step.on_failure);
    console.log(`[run_handlers] status=${status}, step=${step.name}`);
    if (status === 'success' && Array.isArray(step.on_success)) {
      for (const actionObj of step.on_success) {
        console.log(`[run_handlers] Processing action:`, actionObj);
        const handler = registry[actionObj.action];
        if (handler) {
          handler(context, actionObj);
        } else {
          console.warn(
            `[run_handlers] No handler registered for action: ${actionObj.action}`
          );
        }
      }
    } else if (
      status === 'failure' &&
      step.on_failure &&
      step.on_failure.action
    ) {
      console.log(`[run_handlers] Processing failure action:`, step.on_failure);
      const handler = registry[step.on_failure.action];
      if (handler) {
        handler(context, step.on_failure);
      } else {
        console.warn(
          `[run_handlers] No handler registered for action: ${step.on_failure.action}`
        );
      }
    } else {
      console.warn(
        `[run_handlers] No actions to process for status=${status}, step=${step.name}`
      );
    }
  }
}

export default WorkflowExecutor;
