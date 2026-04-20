import { z } from "zod";

export const goalNewActionSchema = z.object({
  title: z.string().min(1, "Informe o título."),
  description: z.string(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]),
  progress: z.coerce.number().min(0, "Mínimo 0%.").max(100, "Máximo 100%."),
  dueDate: z.string(),
  responsibleId: z.string().min(1, "Informe o ID do responsável (UUID).")
});

export type GoalNewActionValues = z.infer<typeof goalNewActionSchema>;

export const GOAL_NEW_ACTION_DEFAULTS: GoalNewActionValues = {
  title: "",
  description: "",
  status: "NOT_STARTED",
  progress: 0,
  dueDate: "",
  responsibleId: ""
};

export const goalNewLinkSchema = z.object({
  type: z.enum(["CONTRACT", "TICKET"]),
  referenceId: z.string().min(1, "Informe o ID de referência.")
});

export type GoalNewLinkValues = z.infer<typeof goalNewLinkSchema>;

export const GOAL_NEW_LINK_DEFAULTS: GoalNewLinkValues = {
  type: "CONTRACT",
  referenceId: ""
};

export const goalManualProgressSchema = z.object({
  progress: z.coerce.number().min(0, "Mínimo 0%.").max(100, "Máximo 100%.")
});

export type GoalManualProgressValues = z.infer<typeof goalManualProgressSchema>;

export const GOAL_MANUAL_PROGRESS_DEFAULTS: GoalManualProgressValues = {
  progress: 0
};
