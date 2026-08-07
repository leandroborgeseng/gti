import assert from "node:assert/strict";
import {
  collectRegularizationPendings,
  contractToFormDefaults,
  mergeCatalogOptionsWithLink,
  safeSelectValue
} from "./contract-form-helpers";
import { CONTRACT_FORM_DEFAULT_VALUES } from "./contract-form-schema";
import type { Contract } from "@/lib/api";

function run(): void {
  // Novo contrato / nulo
  assert.deepEqual(contractToFormDefaults(null), { ...CONTRACT_FORM_DEFAULT_VALUES });
  assert.deepEqual(contractToFormDefaults(undefined), { ...CONTRACT_FORM_DEFAULT_VALUES });

  // Contrato antigo incompleto
  const legacy = contractToFormDefaults({
    id: "c1",
    name: "Legado",
    companyName: "ACME",
    cnpj: "12.345.678/0001-99",
    startDate: "2022-01-15",
    endDate: "2023-01-15",
    managingUnit: "SEC. ADM.",
    organizationId: null,
    contractTypeCatalogId: null,
    hiringTypeId: null,
    contractType: "SOFTWARE",
    fiscal: null,
    manager: null,
    supplier: null,
    glpiGroups: null as unknown as [],
    lawType: "INVALID" as never
  } as unknown as Contract);
  assert.equal(legacy.organizationId, "");
  assert.equal(legacy.contractTypeCatalogId, "");
  assert.equal(legacy.hiringTypeId, "");
  assert.equal(legacy.fiscalId, "");
  assert.equal(legacy.lawType, "");
  assert.equal(legacy.managingUnit, "SEC. ADM.");
  assert.equal(legacy.startDate, "2022-01-15");
  assert.equal(legacy.formalNumber, "");

  // Merge com inativo vinculado
  const merged = mergeCatalogOptionsWithLink(
    [
      { id: "a1", name: "Ativo", active: true, sortOrder: 1 },
      { id: "i1", name: "Inativo", active: false, sortOrder: 0 }
    ],
    "i1",
    { id: "i1", name: "Inativo", active: false },
    "fallback"
  );
  assert.equal(merged[0]?.id, "i1");
  assert.equal(merged[0]?.active, false);
  assert.ok(merged.some((o) => o.id === "a1"));

  // Cadastros auxiliares vazios
  assert.deepEqual(mergeCatalogOptionsWithLink([], null, null, "x"), []);
  assert.equal(safeSelectValue("", new Set(["a"])), undefined);
  assert.equal(safeSelectValue("a", new Set(["a"])), "a");
  assert.equal(safeSelectValue("orphan", new Set(["a"])), undefined);

  const pendings = collectRegularizationPendings(
    { ...CONTRACT_FORM_DEFAULT_VALUES, name: "X", companyName: "Y", cnpj: "12345678901234" },
    {
      organizationOptions: [],
      contractTypeOptions: [],
      hiringTypeOptions: [],
      fiscalIds: new Set(),
      managingUnitLegacy: "SEC. ADM.",
      contractTypeLegacy: "SOFTWARE"
    }
  );
  assert.ok(pendings.some((p) => p.field === "organizationId"));
  assert.ok(pendings.some((p) => p.field === "contractTypeCatalogId"));
  assert.ok(pendings.some((p) => p.field === "fiscalId"));
  assert.ok(pendings.find((p) => p.field === "organizationId")?.message.includes("SEC. ADM."));

  // Inativo vinculado gera pendência
  const inactivePendings = collectRegularizationPendings(
    {
      ...CONTRACT_FORM_DEFAULT_VALUES,
      organizationId: "i1",
      contractTypeCatalogId: "t1",
      formalNumber: "370",
      fiscalId: "f1",
      startDate: "2022-01-01",
      endDate: "2023-01-01",
      name: "N",
      companyName: "C",
      cnpj: "12345678901234"
    },
    {
      organizationOptions: [{ id: "i1", name: "Org", active: false }],
      contractTypeOptions: [{ id: "t1", name: "Tipo", active: true }],
      hiringTypeOptions: [],
      fiscalIds: new Set(["f1"])
    }
  );
  assert.ok(inactivePendings.some((p) => p.field === "organizationId" && p.message.includes("inativo")));

  console.log("contract-form-helpers.spec.ts: ok");
}

run();
