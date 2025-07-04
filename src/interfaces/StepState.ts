import type { EventPayload } from '../event/EventPayload';

export default interface StepState {
  /** Step Name */
  name: string;

  /** Step status */
  status: 'success' | 'ongoing' | 'failure';

  /** payload */
  payload: EventPayload | null;
}
