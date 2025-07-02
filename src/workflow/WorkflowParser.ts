import type { Workflow } from "./Workflow";

export interface WorkflowParser {
  parse_workflow(file_name: string): Promise<Workflow>;
}
