import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "EDITOR", "VIEWER"]);
export const userApprovalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export function onlyDigitsCpf(v: string): string {
  return v.replace(/\D/g, "").slice(0, 11);
}

/** Formata CPF para exibição (000.000.000-00). */
export function formatCpfDisplay(digits: string): string {
  const d = onlyDigitsCpf(digits);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/** Validação de CPF com dígitos verificadores (11 dígitos). */
export function isValidCpf(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(digits[10]);
}

const cpfFieldSchema = z
  .string()
  .min(1, "Informe o CPF.")
  .transform(onlyDigitsCpf)
  .refine((d) => d.length === 11, { message: "CPF deve ter 11 dígitos." })
  .refine(isValidCpf, { message: "CPF inválido." });

const cpfFieldOptionalSchema = z
  .union([z.literal(""), z.string()])
  .transform((v) => (v === "" ? "" : onlyDigitsCpf(v)))
  .refine((d) => d === "" || (d.length === 11 && isValidCpf(d)), { message: "CPF inválido." });

export const createUserFormSchema = z
  .object({
    fullName: z.string().min(1, "Informe o nome completo."),
    cpf: cpfFieldSchema,
    email: z.string().min(1, "Obrigatório").email("E-mail inválido"),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    profileIds: z.array(z.string()).min(1, "Selecione ao menos um perfil."),
    organizationIds: z.array(z.string()),
    allOrganizations: z.boolean().default(false)
  })
  .superRefine((val, ctx) => {
    if (!val.allOrganizations && val.organizationIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione ao menos um órgão ou marque «Todos os órgãos».",
        path: ["organizationIds"]
      });
    }
  });

export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

export const editUserFormSchema = z
  .object({
    fullName: z.string().min(1, "Informe o nome completo."),
    cpf: cpfFieldOptionalSchema,
    profileIds: z.array(z.string()).min(1, "Selecione ao menos um perfil."),
    organizationIds: z.array(z.string()),
    allOrganizations: z.boolean().default(false),
    approvalStatus: userApprovalStatusSchema,
    /** Vazio mantém a senha atual; caso contrário mínimo 8 caracteres. */
    password: z.union([z.literal(""), z.string().min(8, "Mínimo 8 caracteres")])
  })
  .superRefine((val, ctx) => {
    if (!val.allOrganizations && val.organizationIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione ao menos um órgão ou marque «Todos os órgãos».",
        path: ["organizationIds"]
      });
    }
  });

export type EditUserFormValues = z.infer<typeof editUserFormSchema>;
