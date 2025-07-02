import z from "zod";
import { StepSchema } from "./Step";

export const WorkflowSchema = z.object({
  name: z.string().min(1, "Workflow name is required"),
  description: z.string().optional(),
  version: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+$/,
      "Version must follow semantic versioning (x.y.z)",
    ),
  initiating_topic: z.string().min(1, "Initiating event is required"),
  initiating_name: z.string().min(1, "Initiating event name is required"),
  steps: z.array(StepSchema).min(1, "At least one step is required"),
});

export type Workflow = z.infer<typeof WorkflowSchema>;
