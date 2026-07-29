import { z } from "zod";

export function onlyDigitsCnpj(v: string): string {
  return v.replace(/\D/g, "");
}

export function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

const hiringProcedurePattern = /^\d{1,4}\/\d{4}$/;

export const contractTypeSchema = z.enum(["SOFTWARE", "DATACENTER", "INFRA", "SERVICO"]);
export const lawTypeFieldSchema = z.union([z.literal(""), z.enum(["LEI_8666", "LEI_14133"])]);

const glpiGroupLinkSchema = z.object({
  glpiGroupId: z.number().int().positive(),
  glpiGroupName: z.string().optional()
});

/** Campos do contrato + rascunhos dos modais (fiscal / fornecedor rápido). */
export const contractPageSchema = z
  .object({
    /** Número formal sem ano (somente dígitos). Obrigatório na criação. */
    formalNumber: z
      .string()
      .transform(onlyDigits)
      .refine((d) => d === "" || /^\d+$/.test(d), { message: "Informe apenas dígitos no número formal." }),
    /** Número completo legado (preenchido na edição quando já existir). */
    number: z.string().optional().default(""),
    administrativeProcess: z.string().optional().default(""),
    organizationId: z.string().min(1, "Selecione o órgão gestor."),
    contractTypeCatalogId: z.string().min(1, "Selecione o tipo de contrato."),
    contractType: contractTypeSchema,
    hiringTypeId: z.string().optional().default(""),
    hiringProcedureNumber: z
      .string()
      .optional()
      .default("")
      .refine((v) => !v.trim() || hiringProcedurePattern.test(v.trim()), {
        message: "Use o formato NNNN/AAAA (ex.: 0156/2022)."
      }),
    name: z.string().min(1, "Informe o nome."),
    description: z.string(),
    managingUnit: z.string(),
    companyName: z.string().min(1, "Informe a razão social."),
    cnpj: z
      .string()
      .min(1, "Informe o CNPJ.")
      .transform(onlyDigitsCnpj)
      .refine((d) => d.length === 14, { message: "CNPJ deve ter 14 dígitos." }),
    lawType: lawTypeFieldSchema,
    startDate: z.string().min(1, "Informe o início da vigência."),
    endDate: z.string().min(1, "Informe o fim da vigência."),
    /** Mantidos para compatibilidade; valores derivados dos itens contratuais no envio. */
    monthlyValue: z.string().optional().default(""),
    installationValue: z.string().optional().default(""),
    globalValueManual: z.boolean().default(false),
    globalValueCurrent: z.string().optional().default(""),
    globalValueJustification: z.string().optional().default(""),
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
  )
  .refine(
    (d) => {
      if (!d.globalValueManual) return true;
      const value = Number(d.globalValueCurrent.replace(",", "."));
      return Number.isFinite(value) && value >= 0;
    },
    {
      message: "Informe um valor global manual válido.",
      path: ["globalValueCurrent"]
    }
  )
  .refine((d) => !d.globalValueManual || d.globalValueJustification.trim().length > 0, {
    message: "Informe a justificativa do ajuste manual.",
    path: ["globalValueJustification"]
  });

/** Exige número formal na criação (modo edição valida no componente). */
export const createContractPageSchema = contractPageSchema.refine((d) => d.formalNumber.length >= 1, {
  message: "Informe o número formal do contrato (somente dígitos).",
  path: ["formalNumber"]
});

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
  formalNumber: "",
  number: "",
  administrativeProcess: "",
  organizationId: "",
  contractTypeCatalogId: "",
  contractType: "SOFTWARE",
  hiringTypeId: "",
  hiringProcedureNumber: "",
  name: "",
  description: "",
  managingUnit: "",
  companyName: "",
  cnpj: "",
  lawType: "",
  startDate: "",
  endDate: "",
  monthlyValue: "",
  installationValue: "",
  globalValueManual: false,
  globalValueCurrent: "",
  globalValueJustification: "",
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

/** Pré-visualização do número completo número/ano a partir do formal e da vigência. */
export function formatFormalNumberPreview(formalNumber: string, startDate: string): string {
  const digits = onlyDigits(formalNumber);
  if (!digits) return "—";
  if (!startDate || startDate.length < 4) return `${digits}/????`;
  const year = new Date(`${startDate}T12:00:00`).getFullYear();
  if (!Number.isFinite(year)) return `${digits}/????`;
  return `${digits}/${year}`;
}

/** Extrai dígitos do número formal a partir do contrato existente. */
export function formalNumberFromContract(c: {
  formalNumber?: string | null;
  number?: string;
}): string {
  if (c.formalNumber?.trim()) return onlyDigits(c.formalNumber);
  const part = (c.number ?? "").split("/")[0]?.trim();
  return part ? onlyDigits(part) : "";
}
