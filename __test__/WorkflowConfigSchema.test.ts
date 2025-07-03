import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { RESOURCES_DIR } from "./constants";
import YAML from "yaml";
import { WorkflowConfigSchema } from "../src/schemas/WorkflowConfig";

function loadYaml(file: string) {
  const content = fs.readFileSync(
    path.join(RESOURCES_DIR, "workflows", file),
    "utf8",
  );
  return YAML.parse(content);
}

describe("Workflow YAML validation", () => {
  const validFiles = ["valid-workflow-basic.yml"];
  const invalidFiles = ["workflow-bad-version.yml", "workflow-no-steps.yml"];

  validFiles.forEach((file) => {
    it(`✅ passes for ${file}`, () => {
      const data = loadYaml(file);
      const result = WorkflowConfigSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  invalidFiles.forEach((file) => {
    it(`❌ fails for ${file}`, () => {
      const data = loadYaml(file);
      const result = WorkflowConfigSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        console.log(`Validation errors for ${file}:`, result.error.format());
      }
    });
  });
});
