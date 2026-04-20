import { z } from "zod";

function intField(min: number, max: number, emptyMsg: string, rangeMsg: string): z.ZodTypeAny {
  return z.preprocess(
    (v) => (typeof v === "number" && Number.isFinite(v) ? String(v) : v == null ? "" : String(v)),
    z
      .string()
      .min(1, emptyMsg)
      .refine((s) => {
        const n = parseInt(s, 10);
        return Number.isFinite(n) && n >= min && n <= max;
      }, rangeMsg)
  );
}

export const measurementFormSchema = z.object({
  contractId: z.string().min(1, "Indique o contrato."),
  referenceMonth: intField(1, 12, "Indique o mês.", "Mês entre 1 e 12."),
  referenceYear: intField(2000, 2100, "Indique o ano.", "Ano inválido.")
});

export type MeasurementFormValues = z.infer<typeof measurementFormSchema>;
