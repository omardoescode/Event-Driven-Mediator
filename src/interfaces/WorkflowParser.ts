import type { WorkflowConfig } from "../schemas/WorkflowConfig";

/**
 * Interface for workflow definition parsers.
 * Implementations of this interface handle parsing workflow definitions from different formats.
 */
export interface WorkflowParser {
  /**
   * Parses a workflow definition file into a Workflow object.
   * @param {string} file_name - Path to the workflow definition file
   * @returns {Promise<WorkflowConfig>} Parsed workflow object
   * @throws {Error} If the file cannot be read or contains invalid workflow definition
   */
  parse_workflow(file_name: string): Promise<WorkflowConfig>;
}
