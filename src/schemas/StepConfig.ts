import { z } from 'zod';
import {
  ExecuteTopicSchema,
  FailureTopicSchema,
  SuccessTopicSchema,
} from './common';

const ActionSchema = z
  .object({
    action: z.string().min(1, 'Action must not be empty'),
  })
  .and(z.record(z.union([z.string(), z.boolean(), z.number()])));
const OnFailureSchema = ActionSchema;
const OnSuccessSchema = z.array(ActionSchema);

/**
 * Schema definition for workflow steps.
 * Validates the structure and required fields of individual workflow steps.
 */
export const StepConfigSchema = z.object({
  /** Name of the step, used for referencing in dependencies and outputs */
  name: z
    .string()
    .min(1, 'Step name is required')
    .regex(/^[a-zA-Z0-9]+$/, 'Step name must contain only letters and numbers'),

  /** Kafka topic to publish the step execution message to */
  topic: ExecuteTopicSchema,

  /** input parameters for the step, with template variable support */
  input: z.record(z.string()).optional(),

  /** array of step names that must complete before this step can execute */
  depends_on: z.array(z.string()).optional(),

  /** Kafka topic to receive the step execution response on */
  response_topic: z.object({
    /** success topics */
    success: z.array(SuccessTopicSchema),

    /** failure topics */
    failure: z.array(FailureTopicSchema),
  }),

  /** What to do on failure format */
  on_failure: OnFailureSchema.optional(),

  /** What to do on success format */
  on_success: OnSuccessSchema.optional(),
});

/** Type definition for validated workflow steps */
export type StepConfig = z.infer<typeof StepConfigSchema>;
