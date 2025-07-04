import type { EventPayload } from '../event/EventPayload';
import type WorkflowState from '../interfaces/WorkflowState.ts';
import type StepState from '../interfaces/StepState.ts';

export interface ActionContext {
  // Information about the workflow
  workflow: WorkflowState;

  // Information about the step
  step: StepState;

  /** retry a step */
  retry_step(): Promise<void>;

  /** run another handler */
  run_handler(
    action: string,
    params: Record<string, string | boolean | number>
  ): Promise<void>;
}

export type ActionHandler = (
  context: ActionContext,
  params: Record<string, string | boolean | number>
) => Promise<void>;
export default interface ActionRegistry {
  [action: string]: ActionHandler;
}
