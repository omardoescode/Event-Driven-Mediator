import z from "zod";
import { StepConfigSchema } from "./StepConfig";
import { SemanticVersionSchema } from "./common";

/**
 * Schema definition for workflow configurations.
 * Validates the structure and required fields of workflow definitions.
 */
export const WorkflowConfigSchema = z.object({
  /** Name of the workflow */
  name: z.string().min(1, "Workflow name is required"),

  /** Optional description of the workflow's purpose */
  description: z.string().optional(),

  /** Semantic version of the workflow definition */
  version: SemanticVersionSchema,

  /** Information about the initiating event */
  initiating_event: z.object({
    /** Kafka topic that initiates this workflow */
    topic: z.string().min(1, "Initiating event topic is required"),

    /** Name reference for the initiating event */
    name: z.string().min(1, "Initiating event name is required"),
  }),

  /** Array of steps that make up the workflow */
  steps: z
    .array(StepConfigSchema)
    .min(2, "At least two steps are required for a workflow"),
});

/** Type definition for validated workflow configurations */
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
