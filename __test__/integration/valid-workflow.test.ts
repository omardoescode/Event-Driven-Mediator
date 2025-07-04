import { describe, it, expect } from 'vitest';
import MockStateStore from '../mocks/state/MockStateStore';
import { Kafka, logLevel } from 'kafkajs';
import path from 'path';
import Mediator from '../../src/Mediator';
import type WorkflowState from '../../src/interfaces/WorkflowState';
import YAMLWorkflowParser from '../../src/workflow/YAMLWorkflowParser';

const parent = path.resolve(__dirname, '../resources/workflows');

describe('StepSchema YAML validation', () => {
  const valid_workflow = 'valid-workflow-basic.yml';
  it(`✅ passes for ${valid_workflow} and saves state on success`, async () => {
    const state_store = new MockStateStore<WorkflowState>();

    const kafka = new Kafka({
      clientId: 'Mediator',
      brokers: ['localhost:29092'],
      logLevel: logLevel.ERROR,
    });
    const mediator = new Mediator({
      kafka,
      success_registry: {},
      failure_registry: {},
      parser_factory: () => new YAMLWorkflowParser(),
      state_store,
    });

    await mediator.init_workflow(path.join(parent, valid_workflow));
    await mediator.init_topics();
    await mediator.listen();
    await new Promise(res => setTimeout(res, 500)); // Wait for consumers to be ready

    const producer = kafka.producer();
    await producer.connect();
    const name = 'Omar Mohammad';
    await producer.send({
      topic: 'trigger.workflow',
      messages: [
        {
          value: JSON.stringify({
            name,
          }),
        },
      ],
    });
    await new Promise(res => setTimeout(res, 500)); // Wait for workflow to be created

    // Get the workflow_id and state from the mock store
    const keys = Array.from((state_store as any).store.keys());
    console.log(keys);
    expect(keys.length).toBeGreaterThan(0);
    const workflow_id = keys[0] as string;

    // Simulate a success event for the first step
    const workflow_state_result = await state_store.get(workflow_id);
    expect(workflow_state_result.type).toBe('success');
    if (workflow_state_result.type !== 'success') return;
    const { data: workflow_state } = workflow_state_result;

    const stepNames = Object.keys(workflow_state.steps);
    expect(stepNames.length).toBeGreaterThan(0);
    const firstStepName = stepNames[0] as string;
    const firstStep = workflow_state.steps[firstStepName];
    expect(firstStep).toBeDefined();
    console.dir(workflow_state, { depth: null });

    const eventPayload = {
      workflow_id,
      timestamp: new Date().toISOString(),
      success: true,
      output: { username: 'hello', password: 'world' },
    };
    await producer.send({
      topic: 'users.success.create',
      messages: [{ value: JSON.stringify(eventPayload) }],
    });
    await new Promise(res => setTimeout(res, 500)); // Wait for state update

    // Assert the workflow state is as expected
    const finalState_result = await state_store.get(workflow_id);
    expect(finalState_result.type).toBe('success');
    if (finalState_result.type !== 'success') return false;
    const { data: finalState } = finalState_result;
    expect(finalState.status).toBe('Success');
    expect(finalState.steps[firstStepName]?.status).toBe('success');
    console.log(finalState.steps[firstStepName]);

    await mediator.disconnect();
  }, 20000);
});
