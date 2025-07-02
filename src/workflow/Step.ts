import { z } from "zod";

export const StepSchema = z.object({
  name: z.string().min(1, "Step name is required"),
  topic: z.string().min(1, "Step topic is required"),
  expected_response_topic: z.string().optional(),
  input: z.record(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
});

export type Step = z.infer<typeof StepSchema>;
