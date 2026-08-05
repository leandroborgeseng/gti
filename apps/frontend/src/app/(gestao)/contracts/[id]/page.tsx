import type { Route } from "next";
import Link from "next/link";
import { ContractDeleteButton } from "@/components/contracts/contract-delete-button";
import { ContractInternalCodeRegenerateButton } from "@/components/contracts/contract-internal-code-regenerate-button";
import { ContractAmendmentsPanel } from "@/components/contracts/contract-amendments-panel";
import { ContractGlpiGroupsPanel } from "@/components/contracts/contract-glpi-groups-panel";
import { ContractGlpiTicketsPanel } from "@/components/contracts/contract-glpi-tickets-panel";
import { ContractItemChangeHistoryPanel } from "@/components/contracts/contract-item-change-history-panel";
import { ContractPricingItemsPanel } from "@/components/contracts/contract-pricing-items-panel";
import { ContractStatusControl } from "@/components/contracts/contract-status-control";
import { ContractImplantationProportionPanel } from "@/components/contracts/contract-implantation-proportion-panel";
import { ContractStructureEditor } from "@/components/contracts/contract-structure-editor";
import { ContractOccurrencesPanel } from "@/components/contracts/contract-occurrences-panel";
import { ContractSchedulesPanel } from "@/components/contracts/contract-schedules-panel";
import { ContractValidationGroupsPanel } from "@/components/contracts/contract-validation-groups-panel";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { formatBrl } from "@/lib/format-brl";
import { getContract, getContractTypeCatalog, getHiringTypes, getOrganizations } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Encerrado",
  SUSPENDED: "Suspenso"
};

const contractTypeLabel: Record<string, string> = {
  SOFTWARE: "Software",
  DATACENTER: "Datacenter",
  INFRA: "Infraestrutura",
  SERVICO: "Serviço"
};

const lawTypeLabel: Record<string, string> = {
  LEI_8666: "Lei 8.666/1993",
  LEI_14133: "Lei 14.133/2021"
};

function formatSlaTarget(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") {
    return "-";
  }
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) {
    return "-";
  }
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

export default async function ContractDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const [contractRes, orgsRes, hiringRes, typesRes] = await Promise.all([
    safeLoadNullable(() => getContract(params.id)),
    safeLoadNullable(() => getOrganizations()),
    safeLoadNullable(() => getHiringTypes()),
    safeLoadNullable(() => getContractTypeCatalog())
  ]);
  const { data: contract, error } = contractRes;
  if (error) {
    return (
      <div className="space-y-4">
        <DataLoadAlert messages={[error]} title="Não foi possível carregar o contrato" />
        <p className="text-sm">
          <Link
            href={"/contracts" as Route}
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
          >
            Voltar à lista de contratos
          </Link>
        </p>
      </div>
    );
  }
  if (!contract) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Contrato não encontrado.</p>
      </Card>
    );
  }

  const cnpj = contract.cnpj ?? contract.supplier?.cnpj ?? "-";
  const law = contract.lawType ? lawTypeLabel[contract.lawType] ?? contract.lawType : "-";
  const catalogType = contract.contractTypeCatalog
    ?? typesRes.data?.find((t) => t.id === contract.contractTypeCatalogId);
  const tipo = catalogType
    ? catalogType.acronym
      ? `${catalogType.acronym} · ${catalogType.name}`
      : catalogType.name
    : contractTypeLabel[contract.contractType] ?? contract.contractType;
  const org = contract.organization ?? orgsRes.data?.find((o) => o.id === contract.organizationId);
  const orgLabel = org
    ? org.acronym
      ? `${org.acronym} · ${org.name}`
      : org.name
    : contract.managingUnit ?? "-";
  const hiring = contract.hiringType ?? hiringRes.data?.find((h) => h.id === contract.hiringTypeId);
  const formalDisplay =
    contract.formalNumber && contract.contractYear
      ? `${contract.formalNumber}/${contract.contractYear}`
      : contract.number;
  const globalOriginal = contract.globalValueOriginal;
  const globalCurrent = contract.globalValueCurrent;
  const globalAdjustmentDifference =
    contract.globalValueManual && contract.pricingTotals && globalCurrent != null
      ? Number(globalCurrent) - contract.pricingTotals.globalEstimated
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={"/contracts" as Route}
            className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
          >
            ← Voltar aos contratos
          </Link>
          <span className="text-slate-300" aria-hidden>
            |
          </span>
          <Link
            href={`/measurements?contractId=${contract.id}` as Route}
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
          >
            Medições deste contrato
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <ContractInternalCodeRegenerateButton contractId={contract.id} internalCode={contract.internalCode} />
          <ContractDeleteButton
            contractId={contract.id}
            contractNumber={contract.number}
            contractName={contract.name}
          />
        </div>
      </div>

      <Card className="p-5">
        <h1 className="text-xl font-semibold text-slate-900">
          {contract.number} · {contract.name}
        </h1>
        {contract.description ? <p className="mt-2 text-sm text-slate-600">{contract.description}</p> : null}

        <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          {contract.internalCode ? (
            <p>
              <strong className="text-slate-900">Código interno SIGTI:</strong> {contract.internalCode}
            </p>
          ) : null}
          <p>
            <strong className="text-slate-900">Número formal:</strong> {formalDisplay}
          </p>
          {contract.administrativeProcess ? (
            <p>
              <strong className="text-slate-900">Processo administrativo:</strong> {contract.administrativeProcess}
            </p>
          ) : null}
          <p className="md:col-span-2">
            <strong className="text-slate-900">Órgão gestor:</strong> {orgLabel}
          </p>
          {hiring ? (
            <p>
              <strong className="text-slate-900">Modalidade de contratação:</strong> {hiring.name}
            </p>
          ) : null}
          {contract.hiringProcedureNumber ? (
            <p>
              <strong className="text-slate-900">Procedimento licitatório:</strong> {contract.hiringProcedureNumber}
            </p>
          ) : null}
          <p>
            <strong className="text-slate-900">Contratante (razão social):</strong> {contract.companyName}
          </p>
          {contract.supplier ? (
            <p>
              <strong className="text-slate-900">Empresa terceirizada:</strong> {contract.supplier.name}
            </p>
          ) : null}
          <p>
            <strong className="text-slate-900">CNPJ (contrato):</strong> {cnpj}
          </p>
          <div className="flex flex-col gap-1 md:flex-row md:flex-wrap md:items-start md:gap-x-3 md:gap-y-1">
            <p>
              <strong className="text-slate-900">Status:</strong> {statusLabel[contract.status] ?? contract.status}
            </p>
            <ContractStatusControl contractId={contract.id} status={contract.status} />
          </div>
          <p>
            <strong className="text-slate-900">Tipo:</strong> {tipo}
          </p>
          <p>
            <strong className="text-slate-900">Legislação:</strong> {law}
          </p>
          <p>
            <strong className="text-slate-900">Vigência:</strong>{" "}
            {new Date(contract.startDate).toLocaleDateString("pt-BR")} a{" "}
            {new Date(contract.endDate).toLocaleDateString("pt-BR")}
          </p>
          <p>
            <strong className="text-slate-900">Mensalidade (equivalente):</strong> {formatBrl(contract.monthlyValue)}
          </p>
          <p>
            <strong className="text-slate-900">Valores únicos (impl./outros):</strong>{" "}
            {formatBrl(contract.installationValue)}
          </p>
          {contract.implementationPeriodStart || contract.implementationPeriodEnd ? (
            <p>
              <strong className="text-slate-900">Período de implantação:</strong>{" "}
              {contract.implementationPeriodStart
                ? new Date(contract.implementationPeriodStart).toLocaleDateString("pt-BR")
                : "-"}{" "}
              a{" "}
              {contract.implementationPeriodEnd
                ? new Date(contract.implementationPeriodEnd).toLocaleDateString("pt-BR")
                : "-"}
            </p>
          ) : null}
          <p>
            <strong className="text-slate-900">Valor total:</strong> {formatBrl(contract.totalValue)}
          </p>
          {globalOriginal ? (
            <p>
              <strong className="text-slate-900">Valor global original:</strong> {formatBrl(globalOriginal)}
            </p>
          ) : null}
          {globalCurrent ? (
            <p>
              <strong className="text-slate-900">Valor global vigente:</strong> {formatBrl(globalCurrent)}
              {contract.globalValueManual ? (
                <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                  ajuste manual
                </span>
              ) : null}
            </p>
          ) : null}
          {contract.globalValueManual ? (
            <p className="md:col-span-2">
              <strong className="text-slate-900">Justificativa do ajuste manual:</strong>{" "}
              {contract.globalValueJustification ?? "-"}
              {globalAdjustmentDifference != null && Number.isFinite(globalAdjustmentDifference) ? (
                <> · Diferença para os itens: {formatBrl(globalAdjustmentDifference)}</>
              ) : null}
            </p>
          ) : null}
          {contract.pricingTotals ? (
            <p className="md:col-span-2">
              <strong className="text-slate-900">Resumo dos itens:</strong> Mensalidade equivalente{" "}
              {formatBrl(contract.pricingTotals.monthlyValue)} · Recorrentes {formatBrl(contract.pricingTotals.recurringPredicted)} ·
              Únicos {formatBrl(contract.pricingTotals.oneTime)} · Sob demanda {formatBrl(contract.pricingTotals.onDemand)}
            </p>
          ) : null}
          <p>
            <strong className="text-slate-900">Meta de SLA (referência):</strong> {formatSlaTarget(contract.slaTarget ?? undefined)}
          </p>
        </div>

        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fiscal</p>
            <p className="mt-1 text-sm text-slate-800">{contract.fiscal?.name ?? "-"}</p>
            {contract.fiscal?.email ? (
              <a href={`mailto:${contract.fiscal.email}`} className="text-xs text-slate-600 underline">
                {contract.fiscal.email}
              </a>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gestor</p>
            <p className="mt-1 text-sm text-slate-800">{contract.manager?.name ?? "-"}</p>
            {contract.manager?.email ? (
              <a href={`mailto:${contract.manager.email}`} className="text-xs text-slate-600 underline">
                {contract.manager.email}
              </a>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fornecedor cadastrado</p>
            <p className="mt-1 text-sm text-slate-800">{contract.supplier?.name ?? "-"}</p>
            {contract.supplier?.cnpj ? <p className="text-xs text-slate-600">{contract.supplier.cnpj}</p> : null}
          </div>
        </div>
      </Card>

      <ContractPricingItemsPanel contract={contract} />

      <ContractImplantationProportionPanel data={contract.featureImplantationProportion} />

      <ContractGlpiGroupsPanel contractId={contract.id} initialGroups={contract.glpiGroups ?? []} />

      <ContractGlpiTicketsPanel contractId={contract.id} glpiGroups={contract.glpiGroups ?? []} />

      <ContractAmendmentsPanel contract={contract} />

      <ContractSchedulesPanel contract={contract} />

      <ContractOccurrencesPanel contract={contract} />

      <ContractValidationGroupsPanel contractId={contract.id} groups={contract.validationGroups ?? []} />

      <ContractStructureEditor contract={contract} />

      <ContractItemChangeHistoryPanel logs={contract.itemChangeLogs ?? []} />
    </div>
  );
}
