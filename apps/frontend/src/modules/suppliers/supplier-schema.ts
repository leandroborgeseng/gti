import { z } from "zod";

const digits = (s: string): string => s.replace(/\D/g, "");

export const supplierFormSchema = z.object({
  name: z.string().min(1, "Indique a razão social").max(500),
  cnpj: z
    .string()
    .min(1, "Indique o CNPJ")
    .transform(digits)
    .refine((v) => v.length === 14, { message: "CNPJ deve ter 14 dígitos" })
});
