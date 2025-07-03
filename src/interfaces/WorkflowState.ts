import type { EventPayload } from '../event/EventPayload';

export type StepState = {
  /** Step status */
  status: 'success' | 'ongoing' | 'failure';

  /** payload */
  payload: EventPayload | null;

  /** handle failures */
  on_failure?: {
    /** how many retries it has so far */
    retries: number;
  };
};

export default interface WorkflowState {
  /** Unique identifier for this workflow instance */
  workflow_id: string;

  /** Name of the workflow being executed */
  name: string;

  /** Current status of the workflow execution */
  status: 'In Progress' | 'Success' | 'Failed';

  /** Map Step state by the step name */
  steps: Record<string, StepState>;

  /** Timestamp when the workflow was initiated */
  initiated_at: Date;
}
