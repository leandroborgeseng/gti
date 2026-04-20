"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  createContract,
  createFiscal,
  createSupplier,
  getFiscais,
  getSuppliers,
  type Fiscal,
  type Supplier
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import {
  CONTRACT_FORM_DEFAULT_VALUES,
  contractPageSchema,
  onlyDigitsCnpj,
  quickFiscalSchema,
  quickSupplierSchema,
  type ContractPageFormInput,
  type ContractPageParsed
} from "@/modules/contracts/contract-form-schema";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormSection } from "@/components/ui/form-primitives";
import { EntitySelectWithCreate } from "@/components/ui/entity-select-with-create";

type Props = {
  onSuccess?: () => void;
};

type FiscalModalRole = "fiscal" | "manager";

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
  const qc = useQueryClient();
  const qFiscais = useQuery({ queryKey: queryKeys.fiscais, queryFn: getFiscais });
  const qSuppliers = useQuery({ queryKey: queryKeys.suppliers, queryFn: getSuppliers });
  const fiscais = qFiscais.data ?? [];
  const suppliers = qSuppliers.data ?? [];
  const listsLoading = qFiscais.isPending || qSuppliers.isPending;
  const listsError =
    qFiscais.error || qSuppliers.error
      ? [qFiscais.error, qSuppliers.error]
          .filter(Boolean)
          .map((e) => (e instanceof Error ? e.message : String(e)))
          .join(" · ")
      : null;

  const [fiscalModalRole, setFiscalModalRole] = useState<FiscalModalRole | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [newFiscalErr, setNewFiscalErr] = useState<string | null>(null);
  const [newSupplierErr, setNewSupplierErr] = useState<string | null>(null);

  const form = useForm<ContractPageFormInput>({
    resolver: zodResolver(contractPageSchema),
    defaultValues: CONTRACT_FORM_DEFAULT_VALUES
  });

  const createFiscalMut = useMutation({
    mutationFn: async (vars: { name: string; email: string; phone: string; role: FiscalModalRole }) => {
      const created = await createFiscal({ name: vars.name, email: vars.email, phone: vars.phone });
      return { created, role: vars.role };
    },
    onSuccess: ({ created, role }: { created: Fiscal; role: FiscalModalRole }) => {
      toast.success("Fiscal cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.fiscais });
      if (role === "fiscal") {
        form.setValue("fiscalId", created.id, { shouldValidate: true });
        form.clearErrors("fiscalId");
      } else {
        form.setValue("managerId", created.id, { shouldValidate: true });
        form.clearErrors("managerId");
      }
      form.setValue("quickFiscalName", "");
      form.setValue("quickFiscalEmail", "");
      form.setValue("quickFiscalPhone", "");
      setNewFiscalErr(null);
      setFiscalModalRole(null);
    },
    onError: (e: unknown) => {
      setNewFiscalErr(e instanceof Error ? e.message : String(e));
    }
  });

  const createSupplierMut = useMutation({
    mutationFn: (vars: { name: string; cnpj: string }) => createSupplier({ name: vars.name, cnpj: vars.cnpj }),
    onSuccess: (created: Supplier) => {
      toast.success("Fornecedor cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
      form.setValue("supplierId", created.id, { shouldValidate: true });
      form.setValue("companyName", created.name);
      form.setValue("cnpj", created.cnpj);
      form.clearErrors(["supplierId", "companyName", "cnpj"]);
      form.setValue("quickSupplierName", "");
      form.setValue("quickSupplierCnpj", "");
      setNewSupplierErr(null);
      setSupplierModalOpen(false);
    },
    onError: (e: unknown) => {
      setNewSupplierErr(e instanceof Error ? e.message : String(e));
    }
  });

  const createContractMut = useMutation({
    mutationFn: createContract,
    onSuccess: () => {
      toast.success("Contrato cadastrado.");
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
      form.reset(CONTRACT_FORM_DEFAULT_VALUES);
      onSuccess?.();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar contrato");
    }
  });

  const fiscalOptions = useMemo(
    () => fiscais.map((f: Fiscal) => ({ value: f.id, label: `${f.name} · ${f.email}` })),
    [fiscais]
  );

  const supplierOptions = useMemo(
    () => suppliers.map((s: Supplier) => ({ value: s.id, label: `${s.name} (${onlyDigitsCnpj(s.cnpj)})` })),
    [suppliers]
  );

  const onSupplierSelect = useCallback(
    (id: string) => {
      form.setValue("supplierId", id, { shouldValidate: true });
      form.clearErrors(["supplierId", "companyName", "cnpj"]);
      if (!id) return;
      const s = suppliers.find((x: Supplier) => x.id === id);
      if (s) {
        form.setValue("companyName", s.name);
        form.setValue("cnpj", s.cnpj);
      }
    },
    [form, suppliers]
  );

  const openFiscalModal = useCallback((role: FiscalModalRole) => {
    form.setValue("quickFiscalName", "");
    form.setValue("quickFiscalEmail", "");
    form.setValue("quickFiscalPhone", "");
    setNewFiscalErr(null);
    setFiscalModalRole(role);
  }, [form]);

  function submitNewFiscal(): void {
    setNewFiscalErr(null);
    if (!fiscalModalRole) return;
    const r = quickFiscalSchema.safeParse(form.getValues());
    if (!r.success) {
      const msg = r.error.flatten().fieldErrors;
      const first = Object.values(msg).flat()[0];
      setNewFiscalErr(typeof first === "string" ? first : "Verifique os campos.");
      return;
    }
    createFiscalMut.mutate({
      name: r.data.quickFiscalName.trim(),
      email: r.data.quickFiscalEmail.trim(),
      phone: r.data.quickFiscalPhone.trim(),
      role: fiscalModalRole
    });
  }

  function submitNewSupplier(): void {
    setNewSupplierErr(null);
    const r = quickSupplierSchema.safeParse(form.getValues());
    if (!r.success) {
      const msg = r.error.flatten().fieldErrors;
      const first = Object.values(msg).flat()[0];
      setNewSupplierErr(typeof first === "string" ? first : "Verifique os campos.");
      return;
    }
    createSupplierMut.mutate({
      name: r.data.quickSupplierName.trim(),
      cnpj: r.data.quickSupplierCnpj
    });
  }

  function onValidSubmit(data: ContractPageParsed): void {
    const mv = Number(String(data.monthlyValue).replace(",", "."));
    createContractMut.mutate({
      number: data.number.trim(),
      name: data.name.trim(),
      description: data.description.trim() || undefined,
      managingUnit: data.managingUnit.trim() || undefined,
      companyName: data.companyName.trim(),
      cnpj: data.cnpj,
      contractType: data.contractType,
      lawType: data.lawType || undefined,
      startDate: data.startDate,
      endDate: data.endDate,
      monthlyValue: mv,
      fiscalId: data.fiscalId,
      managerId: data.managerId.trim() || undefined,
      supplierId: data.supplierId.trim() || undefined
    });
  }

  const sameAsFiscal = useCallback(() => {
    const fid = form.getValues("fiscalId");
    if (!fid) {
      form.setError("managerId", { type: "manual", message: "Defina primeiro o fiscal." });
      return;
    }
    form.setValue("managerId", fid, { shouldValidate: true });
    form.clearErrors("managerId");
  }, [form]);

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(onValidSubmit)}>
        {listsLoading ? <p className="text-sm text-muted-foreground">A carregar fiscais e fornecedores…</p> : null}
        {listsError ? <p className="text-sm text-destructive">{listsError}</p> : null}

        <FormSection title="Identificação do contrato" description="Número e nome como aparecem na gestão interna.">
          <FormField
            control={form.control}
            name="number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número do contrato</FormLabel>
                <FormControl>
                  <Input placeholder="Ex.: 001/2026" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input placeholder="Denominação do contrato" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contractType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="SOFTWARE">Software</SelectItem>
                    <SelectItem value="DATACENTER">Datacenter</SelectItem>
                    <SelectItem value="INFRA">Infraestrutura</SelectItem>
                    <SelectItem value="SERVICO">Serviço</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lawType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lei aplicável</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === "__default__" ? "" : v)}
                  value={field.value === "" ? "__default__" : field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Padrão do sistema" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__default__">Padrão do sistema</SelectItem>
                    <SelectItem value="LEI_8666">Lei 8.666/93</SelectItem>
                    <SelectItem value="LEI_14133">Lei 14.133/21</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>Se vazio, o servidor usa a regra por omissão (14133).</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="managingUnit"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Órgão gestor</FormLabel>
                <FormControl>
                  <Input placeholder="Ex.: SEC. ADM. E RH" autoComplete="organization" {...field} />
                </FormControl>
                <FormDescription>
                  Ex.: secretaria ou unidade responsável pelo acompanhamento do contrato (quadro de sistemas terceirizados).
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection
          title="Fornecedor"
          description="Vincule a um cadastro existente ou preencha manualmente. Novo fornecedor abre num modal sem sair desta página."
        >
          <div className="sm:col-span-2">
            <Controller
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <EntitySelectWithCreate
                  id="c-supplier"
                  label="Fornecedor cadastrado (opcional)"
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    onSupplierSelect(id);
                  }}
                  options={supplierOptions}
                  placeholder="— Nenhum; preencher manualmente abaixo —"
                  addNewLabel="+ Novo fornecedor"
                  onAddNew={() => {
                    form.setValue("quickSupplierName", "");
                    form.setValue("quickSupplierCnpj", "");
                    setNewSupplierErr(null);
                    setSupplierModalOpen(true);
                  }}
                  disabled={listsLoading}
                  hint="Ao selecionar, a razão social e o CNPJ são preenchidos automaticamente (pode ajustar antes de guardar)."
                />
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Razão social</FormLabel>
                <FormControl>
                  <Input placeholder="Razão social no contrato" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cnpj"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CNPJ</FormLabel>
                <FormControl>
                  <Input placeholder="00.000.000/0000-00" inputMode="numeric" {...field} />
                </FormControl>
                <FormDescription>Formato sugerido: {formatCnpjHint(field.value || "00000000000000")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Responsáveis" description="Fiscal e gestor vêm da mesma lista de fiscais; pode cadastrar novo sem sair da página.">
          <div className="sm:col-span-2">
            <Controller
              control={form.control}
              name="fiscalId"
              render={({ field, fieldState }) => (
                <EntitySelectWithCreate
                  id="c-fiscal"
                  label="Fiscal"
                  required
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    form.clearErrors("fiscalId");
                  }}
                  options={fiscalOptions}
                  placeholder="Selecione o fiscal"
                  addNewLabel="+ Novo fiscal"
                  onAddNew={() => openFiscalModal("fiscal")}
                  disabled={listsLoading}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
          <div className="sm:col-span-2">
            <Controller
              control={form.control}
              name="managerId"
              render={({ field, fieldState }) => (
                <EntitySelectWithCreate
                  id="c-manager"
                  label="Gestor (opcional)"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    form.clearErrors("managerId");
                  }}
                  options={fiscalOptions}
                  placeholder="— Igual ao fiscal (omissão no servidor) —"
                  addNewLabel="+ Novo gestor"
                  onAddNew={() => openFiscalModal("manager")}
                  disabled={listsLoading}
                  error={fieldState.error?.message}
                  hint="Se não selecionar, o servidor assume o mesmo fiscal como gestor."
                />
              )}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={sameAsFiscal} disabled={listsLoading || Boolean(listsError) || !form.watch("fiscalId")}>
              Usar o fiscal selecionado como gestor
            </Button>
          </div>
        </FormSection>

        <FormSection title="Vigência e valores" description="Datas em formato ISO (campo nativo); valor mensal em reais.">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Início da vigência</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fim da vigência</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="monthlyValue"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Valor mensal (R$)</FormLabel>
                <FormControl>
                  <Input type="text" inputMode="decimal" placeholder="0,00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Descrição" description="Opcional — objeto ou observações.">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Texto livre</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Objeto ou observações" className="min-h-[88px] resize-y" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={listsLoading || Boolean(listsError) || createContractMut.isPending}>
            {createContractMut.isPending ? "A guardar…" : "Guardar contrato"}
          </Button>
        </div>

        <Modal
          open={fiscalModalRole !== null}
          onClose={() => setFiscalModalRole(null)}
          title={fiscalModalRole === "manager" ? "Novo gestor (fiscal)" : "Novo fiscal"}
          description="Os dados ficam guardados na lista de fiscais e são selecionados automaticamente neste contrato."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="quickFiscalName"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quickFiscalEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="email@org.br" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quickFiscalPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input placeholder="(00) 00000-0000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {newFiscalErr ? <p className="sm:col-span-2 text-sm text-destructive">{newFiscalErr}</p> : null}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="button" disabled={createFiscalMut.isPending} onClick={() => submitNewFiscal()}>
                {createFiscalMut.isPending ? "A guardar…" : "Guardar e selecionar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setFiscalModalRole(null)}>
                Cancelar
              </Button>
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
            <FormField
              control={form.control}
              name="quickSupplierName"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Razão social</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do fornecedor" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quickSupplierCnpj"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>CNPJ</FormLabel>
                  <FormControl>
                    <Input placeholder="Somente números ou com máscara" inputMode="numeric" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {newSupplierErr ? <p className="sm:col-span-2 text-sm text-destructive">{newSupplierErr}</p> : null}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="button" disabled={createSupplierMut.isPending} onClick={() => submitNewSupplier()}>
                {createSupplierMut.isPending ? "A guardar…" : "Guardar e selecionar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSupplierModalOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      </form>
    </Form>
  );
}
