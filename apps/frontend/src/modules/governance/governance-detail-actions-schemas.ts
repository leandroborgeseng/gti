import { z } from "zod";

export const governanceAcknowledgeSchema = z.object({
  acknowledgedAt: z.string().min(1, "Informe data e hora.")
});

export type GovernanceAcknowledgeValues = z.infer<typeof governanceAcknowledgeSchema>;

export const GOVERNANCE_ACKNOWLEDGE_DEFAULTS: GovernanceAcknowledgeValues = {
  acknowledgedAt: ""
};

export const governanceClassifySchema = z.object({
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  type: z.enum(["CORRETIVA", "EVOLUTIVA"])
});

export type GovernanceClassifyValues = z.infer<typeof governanceClassifySchema>;

export const GOVERNANCE_CLASSIFY_DEFAULTS: GovernanceClassifyValues = {
  priority: "MEDIUM",
  type: "CORRETIVA"
};

export const governanceNotifySchema = z.object({
  description: z.string().min(1, "Descreva a notificação.")
});

export type GovernanceNotifyValues = z.infer<typeof governanceNotifySchema>;

export const GOVERNANCE_NOTIFY_DEFAULTS: GovernanceNotifyValues = {
  description: ""
};

export const governanceResolveSchema = z.object({
  resolvedAt: z.string().min(1, "Informe data e hora.")
});

export type GovernanceResolveValues = z.infer<typeof governanceResolveSchema>;

export const GOVERNANCE_RESOLVE_DEFAULTS: GovernanceResolveValues = {
  resolvedAt: ""
};

export const governanceExtendSchema = z.object({
  newDeadline: z.string().min(1, "Informe o novo prazo."),
  justification: z.string().min(1, "Informe a justificativa."),
  createdBy: z.string().min(1, "Informe o usuário responsável.")
});

export type GovernanceExtendValues = z.infer<typeof governanceExtendSchema>;

export const GOVERNANCE_EXTEND_DEFAULTS: GovernanceExtendValues = {
  newDeadline: "",
  justification: "",
  createdBy: ""
};

export const governanceControladoriaSchema = z.object({
  seiProcessNumber: z.string().min(1, "Informe o número do processo SEI."),
  controladoriaUserId: z.string()
});

export type GovernanceControladoriaValues = z.infer<typeof governanceControladoriaSchema>;

export const GOVERNANCE_CONTROLADORIA_DEFAULTS: GovernanceControladoriaValues = {
  seiProcessNumber: "",
  controladoriaUserId: ""
};
