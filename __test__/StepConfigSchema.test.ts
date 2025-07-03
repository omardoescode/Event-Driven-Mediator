import { describe, it, expect } from "vitest";
import { StepConfigSchema } from "../src/schemas/StepConfig";
import fs from "fs";
import path from "path";
import { RESOURCES_DIR } from "./constants";
import YAML from "yaml";

function loadYaml(file: string) {
  const content = fs.readFileSync(
    path.join(RESOURCES_DIR, "steps", file),
    "utf8",
  );
  return YAML.parse(content);
}

describe("StepSchema YAML validation", () => {
  const validFiles = ["valid-step-1.yml", "valid-step-2.yml"];
  const invalidFiles = [
    "step-missing-response.yml",
    "step-missing-response.yml",
    "step-wrong-action-on-failure.yml",
    "step-wrong-action-on-success.yml",
    "step-on-success-not-array.yml",
  ];

  validFiles.forEach((file) => {
    it(`✅ passes for ${file}`, () => {
      const data = loadYaml(file);
      const result = StepConfigSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  invalidFiles.forEach((file) => {
    it(`❌ fails for ${file}`, () => {
      const data = loadYaml(file);
      const result = StepConfigSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        console.log(`Validation errors for ${file}:`, result.error.format());
      }
    });
  });
});
