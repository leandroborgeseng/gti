import { z } from "zod";

export const glosaTypeSchema = z.enum(["ATRASO", "NAO_ENTREGA", "SLA", "QUALIDADE"]);

export const glosaFormSchema = z.object({
  measurementId: z.string().min(1, "Associe a uma medição."),
  type: glosaTypeSchema,
  value: z
    .string()
    .min(1, "Informe o valor.")
    .refine((s) => {
      const n = Number(String(s).replace(",", "."));
      return Number.isFinite(n) && n > 0;
    }, "Informe um valor maior que zero."),
  createdBy: z.string().optional(),
  justification: z.string().min(1, "A justificativa é obrigatória.")
});

export type GlosaFormValues = z.infer<typeof glosaFormSchema>;
