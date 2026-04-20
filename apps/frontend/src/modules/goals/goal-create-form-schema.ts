import { z } from "zod";

export const goalStatusSchema = z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED"]);

export const goalCreateFormSchema = z.object({
  title: z.string().min(1, "Informe o título."),
  description: z.string().optional(),
  year: z
    .string()
    .min(1, "Indique o ano.")
    .refine((s) => {
      const y = parseInt(s, 10);
      return Number.isFinite(y) && y >= 2020 && y <= 2100;
    }, "Ano inválido."),
  status: goalStatusSchema,
  priority: z.string().optional(),
  responsibleId: z.string().min(1, "Selecione ou crie um utilizador responsável.")
});

export type GoalCreateFormValues = z.infer<typeof goalCreateFormSchema>;
