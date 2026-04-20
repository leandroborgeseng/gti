import { z } from "zod";

export const fiscalFormSchema = z.object({
  name: z.string().min(1, "Indique o nome").max(500),
  email: z.string().min(1, "Indique o e-mail").email("E-mail inválido"),
  phone: z.string().min(1, "Indique o telefone").max(80)
});

export type FiscalFormValues = z.infer<typeof fiscalFormSchema>;
