import { describe, it, expect } from 'vitest';
import path from 'path';
import { RESOURCES_DIR } from '../util/constants';
import { WorkflowConfigSchema } from '../../src/schemas/WorkflowConfig';
import { loadYaml } from '../util/yaml';

const parent = path.join(RESOURCES_DIR, 'workflows');

describe('Workflow YAML validation', () => {
  const validFiles = ['valid-workflow-basic.yml'];
  const invalidFiles = ['workflow-bad-version.yml', 'workflow-no-steps.yml'];

  validFiles.forEach(file => {
    it(`✅ passes for ${file}`, () => {
      const data = loadYaml(file, parent);
      const result = WorkflowConfigSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  invalidFiles.forEach(file => {
    it(`❌ fails for ${file}`, () => {
      const data = loadYaml(file, parent);
      const result = WorkflowConfigSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        console.log(`Validation errors for ${file}:`, result.error.format());
      }
    });
  });
});
