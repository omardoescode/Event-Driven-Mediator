import type { EventPayload } from '../event/EventPayload';
import type StepState from './StepState';

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
