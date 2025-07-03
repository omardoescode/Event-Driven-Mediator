import type { WorkflowParser } from '../interfaces/WorkflowParser';
import { WorkflowConfigSchema } from '../schemas/WorkflowConfig';
import YAML from 'yaml';
import path from 'path';
import fs from 'fs';

/**
 * YAML workflow parser for reading and parsing workflow definitions from YAML files.
 */
class YAMLWorkflowParser implements WorkflowParser {
  /**
   * Parses a YAML workflow definition file into a Workflow object.
   * @param {string} file_name - Path to the YAML workflow definition file
   * @returns {Promise<Workflow>} Parsed and validated workflow object
   * @throws {Error} If the file cannot be read or contains invalid workflow definition
   */
  public async parse_workflow(file_name: string) {
    const content = await this.read_file(file_name);
    const parsed = YAML.parse(content);

    const result = WorkflowConfigSchema.safeParse(parsed);
    if (!result.success) {
      const reason = result.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new Error(`Invalid workflow in ${file_name}:\n${reason}`);
    }
    return result.data;
  }

  /**
   * Reads and returns the contents of a file.
   * @param {string} file_name - Path to the file to read
   * @returns {Promise<string>} Contents of the file
   * @throws {Error} If the file doesn't exist or cannot be read
   * @private
   */
  private async read_file(file_name: string): Promise<any> {
    const abs_path = path.resolve(file_name);
    const exists = await this.file_exists(abs_path);

    if (!exists) throw new Error("File doesn't exist");

    const file_content = await fs.promises.readFile(abs_path, 'utf8');
    return file_content;
  }

  /**
   * Checks if a file exists at the given path.
   * @param {string} abs_path - Absolute path to check
   * @returns {Promise<boolean>} True if the file exists, false otherwise
   * @private
   */
  private async file_exists(abs_path: string): Promise<boolean> {
    return fs.promises
      .access(abs_path, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false);
  }
}

export default YAMLWorkflowParser;
