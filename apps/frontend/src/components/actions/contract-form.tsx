"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Fiscal, Supplier } from "@/lib/api";
import { createContract, createFiscal, createSupplier, getFiscais, getSuppliers } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import {
  FormField,
  FormSection,
  PrimaryButton,
  SecondaryButton,
  formControlClass
} from "@/components/ui/form-primitives";
import { EntitySelectWithCreate } from "@/components/ui/entity-select-with-create";

type Props = {
  onSuccess?: () => void;
};

type FiscalModalRole = "fiscal" | "manager";

function onlyDigitsCnpj(v: string): string {
  return v.replace(/\D/g, "");
}

function formatCnpjHint(v: string): string {
  const d = onlyDigitsCnpj(v).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function ContractForm({ onSuccess }: Props): JSX.Element {
  const [listsLoading, setListsLoading] = useState(true);
  const [listsError, setListsError] = useState<string | null>(null);
  const [fiscais, setFiscais] = useState<Fiscal[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contractType, setContractType] = useState<"SOFTWARE" | "DATACENTER" | "INFRA" | "SERVICO">("SOFTWARE");
  const [lawType, setLawType] = useState<"" | "LEI_8666" | "LEI_14133">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [monthlyValue, setMonthlyValue] = useState("");
  const [fiscalId, setFiscalId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [supplierId, setSupplierId] = useState("");

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [fiscalModalRole, setFiscalModalRole] = useState<FiscalModalRole | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);

  const [newFiscalName, setNewFiscalName] = useState("");
  const [newFiscalEmail, setNewFiscalEmail] = useState("");
  const [newFiscalPhone, setNewFiscalPhone] = useState("");
  const [newFiscalBusy, setNewFiscalBusy] = useState(false);
  const [newFiscalErr, setNewFiscalErr] = useState<string | null>(null);

  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierCnpj, setNewSupplierCnpj] = useState("");
  const [newSupplierBusy, setNewSupplierBusy] = useState(false);
  const [newSupplierErr, setNewSupplierErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setListsLoading(true);
        setListsError(null);
        const [f, s] = await Promise.all([getFiscais(), getSuppliers()]);
        if (cancelled) return;
        setFiscais(f);
        setSuppliers(s);
      } catch (e) {
        if (!cancelled) {
          setListsError(e instanceof Error ? e.message : "Falha ao carregar listas.");
        }
      } finally {
        if (!cancelled) setListsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fiscalOptions = useMemo(
    () => fiscais.map((f) => ({ value: f.id, label: `${f.name} · ${f.email}` })),
    [fiscais]
  );

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: `${s.name} (${onlyDigitsCnpj(s.cnpj)})` })),
    [suppliers]
  );

  const onSupplierSelect = useCallback(
    (id: string) => {
      setSupplierId(id);
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.supplierId;
        delete next.companyName;
        delete next.cnpj;
        return next;
      });
      if (!id) return;
      const s = suppliers.find((x) => x.id === id);
      if (s) {
        setCompanyName(s.name);
        setCnpj(s.cnpj);
      }
    },
    [suppliers]
  );

  const openFiscalModal = useCallback((role: FiscalModalRole) => {
    setNewFiscalName("");
    setNewFiscalEmail("");
    setNewFiscalPhone("");
    setNewFiscalErr(null);
    setFiscalModalRole(role);
  }, []);

  const submitNewFiscal = useCallback(async () => {
    setNewFiscalErr(null);
    if (!newFiscalName.trim() || !newFiscalEmail.trim() || !newFiscalPhone.trim()) {
      setNewFiscalErr("Preencha nome, e-mail e telefone.");
      return;
    }
    try {
      setNewFiscalBusy(true);
      const created = await createFiscal({
        name: newFiscalName.trim(),
        email: newFiscalEmail.trim(),
        phone: newFiscalPhone.trim()
      });
      setFiscais((prev) => [...prev.filter((x) => x.id !== created.id), created]);
      if (fiscalModalRole === "fiscal") {
        setFiscalId(created.id);
        setFieldErrors((p) => {
          const n = { ...p };
          delete n.fiscalId;
          return n;
        });
      } else if (fiscalModalRole === "manager") {
        setManagerId(created.id);
        setFieldErrors((p) => {
          const n = { ...p };
          delete n.managerId;
          return n;
        });
      }
      setFiscalModalRole(null);
    } catch (e) {
      setNewFiscalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setNewFiscalBusy(false);
    }
  }, [fiscalModalRole, newFiscalEmail, newFiscalName, newFiscalPhone]);

  const submitNewSupplier = useCallback(async () => {
    setNewSupplierErr(null);
    if (!newSupplierName.trim() || !onlyDigitsCnpj(newSupplierCnpj)) {
      setNewSupplierErr("Preencha nome e CNPJ válido.");
      return;
    }
    try {
      setNewSupplierBusy(true);
      const created = await createSupplier({
        name: newSupplierName.trim(),
        cnpj: onlyDigitsCnpj(newSupplierCnpj)
      });
      setSuppliers((prev) => [...prev.filter((x) => x.id !== created.id), created]);
      setSupplierId(created.id);
      setCompanyName(created.name);
      setCnpj(created.cnpj);
      setSupplierModalOpen(false);
      setFieldErrors((p) => {
        const n = { ...p };
        delete n.supplierId;
        delete n.companyName;
        delete n.cnpj;
        return n;
      });
    } catch (e) {
      setNewSupplierErr(e instanceof Error ? e.message : String(e));
    } finally {
      setNewSupplierBusy(false);
    }
  }, [newSupplierCnpj, newSupplierName]);

  const validate = useCallback((): boolean => {
    const err: Record<string, string> = {};
    if (!number.trim()) err.number = "Informe o número do contrato.";
    if (!name.trim()) err.name = "Informe o nome.";
    if (!companyName.trim()) err.companyName = "Informe a razão social.";
    const cnpjDigits = onlyDigitsCnpj(cnpj);
    if (cnpjDigits.length !== 14) err.cnpj = "CNPJ deve ter 14 dígitos.";
    if (!fiscalId) err.fiscalId = "Selecione ou cadastre o fiscal.";
    if (!startDate || !endDate) {
      err.dates = "Informe início e fim da vigência.";
    } else if (new Date(endDate) < new Date(startDate)) {
      err.dates = "A data final não pode ser anterior à data inicial.";
    }
    const mv = Number(String(monthlyValue).replace(",", "."));
    if (!Number.isFinite(mv) || mv <= 0) err.monthlyValue = "Valor mensal deve ser maior que zero.";
    setFieldErrors(err);
    return Object.keys(err).length === 0;
  }, [cnpj, companyName, endDate, fiscalId, monthlyValue, name, number, startDate]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("");
    if (!validate()) return;
    const mv = Number(String(monthlyValue).replace(",", "."));
    try {
      setBusy(true);
      await createContract({
        number: number.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        companyName: companyName.trim(),
        cnpj: onlyDigitsCnpj(cnpj),
        contractType,
        lawType: lawType || undefined,
        startDate,
        endDate,
        monthlyValue: mv,
        fiscalId,
        managerId: managerId || undefined,
        supplierId: supplierId || undefined
      });
      setStatus("Contrato cadastrado com sucesso.");
      setNumber("");
      setName("");
      setDescription("");
      setCompanyName("");
      setCnpj("");
      setContractType("SOFTWARE");
      setLawType("");
      setStartDate("");
      setEndDate("");
      setMonthlyValue("");
      setFiscalId("");
      setManagerId("");
      setSupplierId("");
      setFieldErrors({});
      onSuccess?.();
    } catch (error) {
      setStatus(String(error instanceof Error ? error.message : error));
    } finally {
      setBusy(false);
    }
  }

  const sameAsFiscal = useCallback(() => {
    if (!fiscalId) {
      setFieldErrors((p) => ({ ...p, managerId: "Defina primeiro o fiscal." }));
      return;
    }
    setManagerId(fiscalId);
    setFieldErrors((p) => {
      const n = { ...p };
      delete n.managerId;
      return n;
    });
  }, [fiscalId]);

  return (
    <form className="space-y-5" onSubmit={(e) => void onSubmit(e)}>
      {listsLoading ? (
        <p className="text-sm text-slate-600">A carregar fiscais e fornecedores…</p>
      ) : null}
      {listsError ? <p className="text-sm text-amber-800">{listsError}</p> : null}

      <FormSection title="Identificação do contrato" description="Número e nome como aparecem na gestão interna.">
        <FormField label="Número do contrato" htmlFor="c-number" required error={fieldErrors.number}>
          <input
            id="c-number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={formControlClass}
            placeholder="Ex.: 001/2026"
            autoComplete="off"
          />
        </FormField>
        <FormField label="Nome" htmlFor="c-name" required error={fieldErrors.name} className="sm:col-span-2">
          <input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={formControlClass}
            placeholder="Denominação do contrato"
          />
        </FormField>
        <FormField label="Tipo" htmlFor="c-type" required>
          <select
            id="c-type"
            value={contractType}
            onChange={(e) => setContractType(e.target.value as typeof contractType)}
            className={formControlClass}
          >
            <option value="SOFTWARE">Software</option>
            <option value="DATACENTER">Datacenter</option>
            <option value="INFRA">Infraestrutura</option>
            <option value="SERVICO">Serviço</option>
          </select>
        </FormField>
        <FormField label="Lei aplicável" htmlFor="c-law" hint="Se vazio, o servidor usa a regra por omissão (14133).">
          <select id="c-law" value={lawType} onChange={(e) => setLawType(e.target.value as typeof lawType)} className={formControlClass}>
            <option value="">Padrão do sistema</option>
            <option value="LEI_8666">Lei 8.666/93</option>
            <option value="LEI_14133">Lei 14.133/21</option>
          </select>
        </FormField>
      </FormSection>

      <FormSection
        title="Fornecedor"
        description="Vincule a um cadastro existente ou preencha manualmente. Novo fornecedor abre num modal sem sair desta página."
      >
        <div className="sm:col-span-2">
          <EntitySelectWithCreate
            id="c-supplier"
            label="Fornecedor cadastrado (opcional)"
            value={supplierId}
            onChange={onSupplierSelect}
            options={supplierOptions}
            placeholder="— Nenhum; preencher manualmente abaixo —"
            addNewLabel="+ Novo fornecedor"
            onAddNew={() => {
              setNewSupplierName("");
              setNewSupplierCnpj("");
              setNewSupplierErr(null);
              setSupplierModalOpen(true);
            }}
            disabled={listsLoading}
            hint="Ao selecionar, a razão social e o CNPJ são preenchidos automaticamente (pode ajustar antes de guardar)."
          />
        </div>
        <FormField label="Razão social" htmlFor="c-company" required error={fieldErrors.companyName}>
          <input
            id="c-company"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={formControlClass}
            placeholder="Razão social no contrato"
          />
        </FormField>
        <FormField label="CNPJ" htmlFor="c-cnpj" required error={fieldErrors.cnpj} hint={`Formato sugerido: ${formatCnpjHint(cnpj || "00000000000000")}`}>
          <input
            id="c-cnpj"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            className={formControlClass}
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
          />
        </FormField>
      </FormSection>

      <FormSection title="Responsáveis" description="Fiscal e gestor vêm da mesma lista de fiscais; pode cadastrar novo sem sair da página.">
        <div className="sm:col-span-2">
          <EntitySelectWithCreate
            id="c-fiscal"
            label="Fiscal"
            required
            value={fiscalId}
            onChange={(v) => {
              setFiscalId(v);
              setFieldErrors((p) => {
                const n = { ...p };
                delete n.fiscalId;
                return n;
              });
            }}
            options={fiscalOptions}
            placeholder="Selecione o fiscal"
            addNewLabel="+ Novo fiscal"
            onAddNew={() => openFiscalModal("fiscal")}
            disabled={listsLoading}
            error={fieldErrors.fiscalId}
          />
        </div>
        <div className="sm:col-span-2">
          <EntitySelectWithCreate
            id="c-manager"
            label="Gestor (opcional)"
            value={managerId}
            onChange={(v) => {
              setManagerId(v);
              setFieldErrors((p) => {
                const n = { ...p };
                delete n.managerId;
                return n;
              });
            }}
            options={fiscalOptions}
            placeholder="— Igual ao fiscal (omissão no servidor) —"
            addNewLabel="+ Novo gestor"
            onAddNew={() => openFiscalModal("manager")}
            disabled={listsLoading}
            error={fieldErrors.managerId}
            hint="Se não selecionar, o servidor assume o mesmo fiscal como gestor."
          />
        </div>
        <div className="sm:col-span-2">
          <SecondaryButton type="button" onClick={sameAsFiscal} disabled={listsLoading || !fiscalId}>
            Usar o fiscal selecionado como gestor
          </SecondaryButton>
        </div>
      </FormSection>

      <FormSection title="Vigência e valores" description="Datas em formato ISO (campo nativo); valor mensal em reais.">
        {fieldErrors.dates ? (
          <p className="sm:col-span-2 text-sm text-amber-800" role="alert">
            {fieldErrors.dates}
          </p>
        ) : null}
        <FormField label="Início da vigência" htmlFor="c-start" required>
          <input id="c-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={formControlClass} />
        </FormField>
        <FormField label="Fim da vigência" htmlFor="c-end" required>
          <input id="c-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={formControlClass} />
        </FormField>
        <FormField label="Valor mensal (R$)" htmlFor="c-monthly" required error={fieldErrors.monthlyValue} className="sm:col-span-2">
          <input
            id="c-monthly"
            type="text"
            inputMode="decimal"
            value={monthlyValue}
            onChange={(e) => setMonthlyValue(e.target.value)}
            className={formControlClass}
            placeholder="0,00"
          />
        </FormField>
      </FormSection>

      <FormSection title="Descrição" description="Opcional — objeto ou observações.">
        <FormField label="Texto livre" htmlFor="c-desc" className="sm:col-span-2">
          <textarea
            id="c-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${formControlClass} min-h-[88px] resize-y`}
            rows={3}
            placeholder="Objeto ou observações"
          />
        </FormField>
      </FormSection>

      {status ? (
        <p className={`text-sm ${status.includes("sucesso") ? "text-emerald-700" : "text-amber-800"}`} role="status">
          {status}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton type="submit" disabled={listsLoading || Boolean(listsError)} busy={busy} busyLabel="A guardar…">
          Guardar contrato
        </PrimaryButton>
      </div>

      <Modal
        open={fiscalModalRole !== null}
        onClose={() => setFiscalModalRole(null)}
        title={fiscalModalRole === "manager" ? "Novo gestor (fiscal)" : "Novo fiscal"}
        description="Os dados ficam guardados na lista de fiscais e são selecionados automaticamente neste contrato."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nome" htmlFor="nf-name" required className="sm:col-span-2">
            <input
              id="nf-name"
              value={newFiscalName}
              onChange={(e) => setNewFiscalName(e.target.value)}
              className={formControlClass}
              placeholder="Nome completo"
            />
          </FormField>
          <FormField label="E-mail" htmlFor="nf-email" required>
            <input
              id="nf-email"
              type="email"
              value={newFiscalEmail}
              onChange={(e) => setNewFiscalEmail(e.target.value)}
              className={formControlClass}
              placeholder="email@org.br"
            />
          </FormField>
          <FormField label="Telefone" htmlFor="nf-phone" required>
            <input
              id="nf-phone"
              value={newFiscalPhone}
              onChange={(e) => setNewFiscalPhone(e.target.value)}
              className={formControlClass}
              placeholder="(00) 00000-0000"
            />
          </FormField>
          {newFiscalErr ? <p className="sm:col-span-2 text-sm text-amber-800">{newFiscalErr}</p> : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <PrimaryButton type="button" busy={newFiscalBusy} onClick={() => void submitNewFiscal()}>
              Guardar e selecionar
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setFiscalModalRole(null)}>
              Cancelar
            </SecondaryButton>
          </div>
        </div>
      </Modal>

      <Modal
        open={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        title="Novo fornecedor"
        description="Após guardar, o fornecedor passa a constar na lista e os campos do contrato são preenchidos."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Razão social" htmlFor="ns-name" required className="sm:col-span-2">
            <input
              id="ns-name"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              className={formControlClass}
              placeholder="Nome do fornecedor"
            />
          </FormField>
          <FormField label="CNPJ" htmlFor="ns-cnpj" required className="sm:col-span-2">
            <input
              id="ns-cnpj"
              value={newSupplierCnpj}
              onChange={(e) => setNewSupplierCnpj(e.target.value)}
              className={formControlClass}
              placeholder="Somente números ou com máscara"
              inputMode="numeric"
            />
          </FormField>
          {newSupplierErr ? <p className="sm:col-span-2 text-sm text-amber-800">{newSupplierErr}</p> : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <PrimaryButton type="button" busy={newSupplierBusy} onClick={() => void submitNewSupplier()}>
              Guardar e selecionar
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setSupplierModalOpen(false)}>
              Cancelar
            </SecondaryButton>
          </div>
        </div>
      </Modal>
    </form>
  );
}
