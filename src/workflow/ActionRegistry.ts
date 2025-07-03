import type { EventPayload } from "../event/EventPayload";

export interface ActionContext {
  workflow_id: string;
  workflow_name: string;
  step_name: string;
  step_output: EventPayload;
}

export type ActionHandler = (context: ActionContext, params?: any) => void;
export default interface ActionRegistry {
  [action: string]: ActionHandler;
}
