import { z } from "zod";

export const EventPayloadSchema = z.object({
  workflow_id: z.string(),
  timestamp: z.string(),
  success: z.boolean(),
  output: z.record(z.any()),
});

export type EventPayload = z.infer<typeof EventPayloadSchema>;
