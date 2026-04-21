import { z } from "zod";

export function onlyDigitsCnpj(v: string): string {
  return v.replace(/\D/g, "");
}

export const contractTypeSchema = z.enum(["SOFTWARE", "DATACENTER", "INFRA", "SERVICO"]);
export const lawTypeFieldSchema = z.union([z.literal(""), z.enum(["LEI_8666", "LEI_14133"])]);

const glpiGroupLinkSchema = z.object({
  glpiGroupId: z.number().int().positive(),
  glpiGroupName: z.string().optional()
});

/** Campos do contrato + rascunhos dos modais (fiscal / fornecedor rápido). */
export const contractPageSchema = z
  .object({
    number: z.string().min(1, "Informe o número do contrato."),
    name: z.string().min(1, "Informe o nome."),
    description: z.string(),
    managingUnit: z.string(),
    companyName: z.string().min(1, "Informe a razão social."),
    cnpj: z
      .string()
      .min(1, "Informe o CNPJ.")
      .transform(onlyDigitsCnpj)
      .refine((d) => d.length === 14, { message: "CNPJ deve ter 14 dígitos." }),
    contractType: contractTypeSchema,
    lawType: lawTypeFieldSchema,
    startDate: z.string().min(1, "Informe o início da vigência."),
    endDate: z.string().min(1, "Informe o fim da vigência."),
    monthlyValue: z
      .string()
      .min(1, "Informe o valor mensal.")
      .refine((s) => {
        const n = Number(String(s).replace(",", "."));
        return Number.isFinite(n) && n > 0;
      }, { message: "Valor mensal deve ser maior que zero." }),
    installationValue: z
      .string()
      .optional()
      .transform((s) => (typeof s === "string" ? s.trim() : ""))
      .refine((s) => {
        if (s === "") return true;
        const n = Number(String(s).replace(",", "."));
        return Number.isFinite(n) && n >= 0;
      }, { message: "Valor de implantação inválido." }),
    implementationPeriodStart: z.string().optional().default(""),
    implementationPeriodEnd: z.string().optional().default(""),
    fiscalId: z.string().min(1, "Selecione ou cadastre o fiscal."),
    managerId: z.string(),
    supplierId: z.string(),
    quickFiscalName: z.string(),
    quickFiscalEmail: z.string(),
    quickFiscalPhone: z.string(),
    quickSupplierName: z.string(),
    quickSupplierCnpj: z.string(),
    glpiGroups: z.union([z.array(glpiGroupLinkSchema), z.undefined()]).transform((x) => x ?? [])
  })
  .refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
    message: "A data final não pode ser anterior à data inicial.",
    path: ["endDate"]
  })
  .refine(
    (d) => {
      const a = (d.implementationPeriodStart ?? "").trim();
      const b = (d.implementationPeriodEnd ?? "").trim();
      if (!a || !b) return true;
      return new Date(b) >= new Date(a);
    },
    {
      message: "O fim do período de implantação não pode ser anterior ao início.",
      path: ["implementationPeriodEnd"]
    }
  );

export type ContractPageFormInput = z.input<typeof contractPageSchema>;
export type ContractPageParsed = z.output<typeof contractPageSchema>;

export const quickFiscalSchema = z.object({
  quickFiscalName: z.string().min(1, "Preencha o nome."),
  quickFiscalEmail: z.string().email("E-mail inválido."),
  quickFiscalPhone: z.string().min(1, "Preencha o telefone.")
});

export const quickSupplierSchema = z.object({
  quickSupplierName: z.string().min(1, "Preencha a razão social."),
  quickSupplierCnpj: z
    .string()
    .min(1, "Informe o CNPJ.")
    .transform(onlyDigitsCnpj)
    .refine((d) => d.length === 14, { message: "CNPJ deve ter 14 dígitos." })
});

export const CONTRACT_FORM_DEFAULT_VALUES: ContractPageFormInput = {
  number: "",
  name: "",
  description: "",
  managingUnit: "",
  companyName: "",
  cnpj: "",
  contractType: "SOFTWARE",
  lawType: "",
  startDate: "",
  endDate: "",
  monthlyValue: "",
  installationValue: "",
  implementationPeriodStart: "",
  implementationPeriodEnd: "",
  fiscalId: "",
  managerId: "",
  supplierId: "",
  quickFiscalName: "",
  quickFiscalEmail: "",
  quickFiscalPhone: "",
  quickSupplierName: "",
  quickSupplierCnpj: "",
  glpiGroups: []
};
