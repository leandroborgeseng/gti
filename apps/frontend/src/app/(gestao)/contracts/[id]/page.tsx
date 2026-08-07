import { Suspense } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ContractDetailView } from "@/components/contracts/contract-detail-view";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { getContract, getContractTypeCatalog, getHiringTypes, getOrganizations } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";

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

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function ContractDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<JSX.Element> {
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
  const catalogType =
    contract.contractTypeCatalog ?? typesRes.data?.find((t) => t.id === contract.contractTypeCatalogId);
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

  const initialTab = firstParam(searchParams?.tab);

  return (
    <Suspense
      fallback={
        <Card className="p-5">
          <p className="text-sm text-slate-600">Carregando contrato…</p>
        </Card>
      }
    >
      <ContractDetailView
        contract={contract}
        initialTab={initialTab}
        labels={{
          formalDisplay,
          orgLabel,
          tipoLabel: tipo,
          hiringLabel: hiring?.name ?? null,
          lawLabel: law,
          cnpj
        }}
      />
    </Suspense>
  );
}
