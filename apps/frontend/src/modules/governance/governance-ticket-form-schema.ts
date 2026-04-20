import { z } from "zod";

export const governanceCreateFormSchema = z.object({
  ticketId: z.string().min(1, "Indique o identificador do chamado no GLPI."),
  contractId: z.string().min(1, "Selecione ou indique o contrato."),
  openedAt: z.string().optional()
});

export type GovernanceCreateFormValues = z.infer<typeof governanceCreateFormSchema>;
