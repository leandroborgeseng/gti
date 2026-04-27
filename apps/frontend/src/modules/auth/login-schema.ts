import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().min(1, "Indique o e-mail").email("E-mail inválido"),
  password: z.string().min(1, "Indique a senha")
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
