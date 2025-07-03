import { z } from 'zod';

/**
 * Schema definition for workflow event payloads.
 * Validates the structure and types of event messages in the system.
 */
export const EventPayloadSchema = z.object({
  /** Unique identifier for the workflow instance */
  workflow_id: z.string(),
  /** ISO timestamp of when the event occurred */
  timestamp: z.string(),
  /** Indicates whether the step completed successfully */
  success: z.boolean(),
  /** Additional data produced by the step execution */
  output: z.record(z.any()),
});

/** Type definition for validated event payloads */
export type EventPayload = z.infer<typeof EventPayloadSchema>;
