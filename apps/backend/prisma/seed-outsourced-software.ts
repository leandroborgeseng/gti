import "./env-bootstrap";

/**
 * Importa os contratos de software do quadro «Sistemas terceirizados atuais» (referência abril/2026).
 * Idempotente: reexecutar ignora números já existentes.
 *
 * Uso (com DATABASE_URL e backend configurado):
 *   cd apps/backend && npx ts-node --transpile-only prisma/seed-outsourced-software.ts
 *
 * Opcional: SEED_CONTRACTING_PARTY, SEED_CONTRACTING_CNPJ (14 dígitos, sem máscara).
 */
import { ContractStatus, ContractType, LawType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONTRACTING_PARTY =
  process.env.SEED_CONTRACTING_PARTY?.trim() || "Órgão contratante — sistemas terceirizados (importação)";
const CONTRACTING_CNPJ = (process.env.SEED_CONTRACTING_CNPJ || "00000000000191").replace(/\D/g, "").slice(0, 14);

type Row = {
  number: string;
  supplierName: string;
  managingUnit: string;
  annualValue: number;
  monthlyValue: number;
  startISO: string;
  endISO: string;
  months: number;
  description?: string;
};

/** Dados alinhados ao quadro fornecido (valores em BRL). */
const ROWS: Row[] = [
  {
    number: "ST-2026-001",
    supplierName: "EDDYDATA",
    managingUnit: "SEC. ADM. E RH",
    annualValue: 3_344_807.64,
    monthlyValue: 278_733.97,
    startISO: "2022-05-10",
    endISO: "2026-05-09",
    months: 48
  },
  {
    number: "ST-2026-002",
    supplierName: "APROVA DIGITAL",
    managingUnit: "SEC. INFRAESTRUTURA",
    annualValue: 335_039.88,
    monthlyValue: 27_919.99,
    startISO: "2021-06-22",
    endISO: "2026-06-21",
    months: 60
  },
  {
    number: "ST-2026-003",
    supplierName: "SIL TECNOLOGIA (MARCELO NOGUEIRA)",
    managingUnit: "SEC. FINANÇAS",
    annualValue: 1_371_179.64,
    monthlyValue: 114_264.97,
    startISO: "2025-07-11",
    endISO: "2026-07-10",
    months: 12,
    description:
      "Contrato destacado no quadro operacional de origem (acompanhamento prioritário sugerido).\n" +
      `Prazo contratual: ${12} meses.`
  },
  {
    number: "ST-2026-004",
    supplierName: "INOVAÇÃO GOV",
    managingUnit: "SEC. ADM. E RH",
    annualValue: 437_476.92,
    monthlyValue: 36_456.41,
    startISO: "2022-05-10",
    endISO: "2026-05-09",
    months: 48
  },
  {
    number: "ST-2026-005",
    supplierName: "EMPRESARIAL (FROTA)",
    managingUnit: "SEC. ADM. E RH",
    annualValue: 182_604.96,
    monthlyValue: 15_217.08,
    startISO: "2023-03-21",
    endISO: "2027-03-20",
    months: 48
  },
  {
    number: "ST-2026-006",
    supplierName: "GESUAS",
    managingUnit: "SEC. AÇÃO SOCIAL",
    annualValue: 178_232.76,
    monthlyValue: 14_852.73,
    startISO: "2021-02-05",
    endISO: "2026-02-04",
    months: 60
  },
  {
    number: "ST-2026-007",
    supplierName: "INTEGRATIVA",
    managingUnit: "PROCURADORIA JURÍDICA",
    annualValue: 328_910.76,
    monthlyValue: 27_409.23,
    startISO: "2021-04-19",
    endISO: "2026-04-18",
    months: 60
  },
  {
    number: "ST-2026-008",
    supplierName: "MSTECH",
    managingUnit: "SEC. EDUCAÇÃO",
    annualValue: 281_387.04,
    monthlyValue: 23_448.92,
    startISO: "2021-11-03",
    endISO: "2026-11-02",
    months: 60
  },
  {
    number: "ST-2026-009",
    supplierName: "SENIOR",
    managingUnit: "SEC. ADM. E RH",
    annualValue: 419_483.04,
    monthlyValue: 34_956.92,
    startISO: "2022-09-23",
    endISO: "2027-09-22",
    months: 60
  }
];

function seedSupplierCnpj(index: number): string {
  const n = String(index + 1).padStart(4, "0");
  return `9900000000${n}`.slice(0, 14);
}

async function main(): Promise<void> {
  const fiscalEmail = "importacao.sistemas@seed.local";
  const fiscal = await prisma.fiscal.upsert({
    where: { email: fiscalEmail },
    create: {
      name: "Coordenação — importação sistemas terceirizados",
      email: fiscalEmail,
      phone: "11999990000"
    },
    update: {}
  });

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < ROWS.length; i++) {
    const row = ROWS[i];
    const exists = await prisma.contract.findFirst({ where: { number: row.number, deletedAt: null } });
    if (exists) {
      skipped += 1;
      continue;
    }

    const supplierCnpj = seedSupplierCnpj(i);
    const supplier = await prisma.supplier.upsert({
      where: { cnpj: supplierCnpj },
      create: { name: row.supplierName, cnpj: supplierCnpj },
      update: { name: row.supplierName }
    });

    const baseDesc =
      `Importado do quadro «Sistemas terceirizados atuais». Vigência declarada: ${row.months} meses. ` +
      `Valor anual de referência: R$ ${row.annualValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`;

    await prisma.contract.create({
      data: {
        number: row.number,
        name: `${row.supplierName} — software terceirizado`,
        description: row.description ? `${row.description}\n\n${baseDesc}` : baseDesc,
        managingUnit: row.managingUnit,
        companyName: CONTRACTING_PARTY,
        cnpj: CONTRACTING_CNPJ,
        contractType: ContractType.SOFTWARE,
        lawType: LawType.LEI_14133,
        startDate: new Date(row.startISO),
        endDate: new Date(row.endISO),
        totalValue: row.annualValue,
        monthlyValue: row.monthlyValue,
        status: ContractStatus.ACTIVE,
        fiscalId: fiscal.id,
        managerId: fiscal.id,
        supplierId: supplier.id
      }
    });
    created += 1;
  }

  console.log(`Seed sistemas terceirizados: ${created} contrato(s) criado(s), ${skipped} ignorado(s) (já existiam).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
