import { z } from "zod";

const digits = (s: string): string => s.replace(/\D/g, "");

/** Converte textarea (vírgula ou linhas) em lista de contatos com e-mail. */
export function parseContactsText(text: string): Array<{ email: string }> {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((e) => e.includes("@"))
    .map((email) => ({ email }));
}

export function contactsToText(contacts: unknown): string {
  if (!Array.isArray(contacts)) return "";
  return contacts
    .map((c) => {
      if (c && typeof c === "object" && "email" in c && typeof (c as { email: unknown }).email === "string") {
        return String((c as { email: string }).email).trim();
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export const supplierFormSchema = z.object({
  name: z.string().min(1, "Indique a razão social").max(500),
  cnpj: z
    .string()
    .min(1, "Indique o CNPJ")
    .transform(digits)
    .refine((v) => v.length === 14, { message: "CNPJ deve ter 14 dígitos" }),
  contactsText: z.string().optional().default("")
});

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;
