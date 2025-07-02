import type { WorkflowParser } from "./WorkflowParser";
import { WorkflowSchema } from "./Workflow";
import YAML from "yaml";
import path from "path";
import fs from "fs";

class YAMLWorkflowParser implements WorkflowParser {
  public async parse_workflow(file_name: string) {
    const content = await this.read_file(file_name);
    const parsed = YAML.parse(content);

    const result = WorkflowSchema.safeParse(parsed);
    if (!result.success) {
      const reason = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("\n");
      throw new Error(`Invalid workflow in ${file_name}:\n${reason}`);
    }
    return result.data;
  }

  private async read_file(file_name: string): Promise<any> {
    const abs_path = path.resolve(file_name);
    const exists = await this.file_exists(abs_path);

    if (!exists) throw new Error("File doesn't exist");

    const file_content = await fs.promises.readFile(abs_path, "utf8");
    return file_content;
  }

  private async file_exists(abs_path: string): Promise<boolean> {
    return fs.promises
      .access(abs_path, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false);
  }
}

export default YAMLWorkflowParser;
