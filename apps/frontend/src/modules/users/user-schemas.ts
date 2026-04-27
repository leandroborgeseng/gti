import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "EDITOR", "VIEWER"]);
export const userApprovalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const createUserFormSchema = z.object({
  email: z.string().min(1, "Obrigatório").email("E-mail inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  role: userRoleSchema
});

export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

export const editUserFormSchema = z.object({
  role: userRoleSchema,
  approvalStatus: userApprovalStatusSchema,
  /** Vazio mantém a senha atual; caso contrário mínimo 8 caracteres. */
  password: z.union([z.literal(""), z.string().min(8, "Mínimo 8 caracteres")])
});

export type EditUserFormValues = z.infer<typeof editUserFormSchema>;
