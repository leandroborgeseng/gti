"use client";

import type { Route } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { DatabaseBackup } from "lucide-react";
import type { UserRecord } from "@/lib/api";
import { UsersView } from "@/components/users/users-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const panelFallback = (
  <p className="py-8 text-center text-sm text-muted-foreground">Carregando painel…</p>
);

const OrganizationsAdminPanel = dynamic(
  () =>
    import("@/components/admin/organizations-admin-panel").then((m) => ({
      default: m.OrganizationsAdminPanel
    })),
  { loading: () => panelFallback }
);
const PermissionsAdminPanel = dynamic(
  () =>
    import("@/components/admin/permissions-admin-panel").then((m) => ({
      default: m.PermissionsAdminPanel
    })),
  { loading: () => panelFallback }
);
const ItemTypesAdminPanel = dynamic(
  () =>
    import("@/components/admin/item-types-admin-panel").then((m) => ({
      default: m.ItemTypesAdminPanel
    })),
  { loading: () => panelFallback }
);
const ContractTypesAdminPanel = dynamic(
  () =>
    import("@/components/admin/contract-types-admin-panel").then((m) => ({
      default: m.ContractTypesAdminPanel
    })),
  { loading: () => panelFallback }
);
const HiringTypesAdminPanel = dynamic(
  () =>
    import("@/components/admin/hiring-types-admin-panel").then((m) => ({
      default: m.HiringTypesAdminPanel
    })),
  { loading: () => panelFallback }
);
const NotificationTemplatesAdminPanel = dynamic(
  () =>
    import("@/components/admin/notification-templates-admin-panel").then((m) => ({
      default: m.NotificationTemplatesAdminPanel
    })),
  { loading: () => panelFallback }
);
const IdentificationMigrationReviewPanel = dynamic(
  () =>
    import("@/components/admin/identification-migration-review-panel").then((m) => ({
      default: m.IdentificationMigrationReviewPanel
    })),
  { loading: () => panelFallback }
);
const PricingMigrationReviewPanel = dynamic(
  () =>
    import("@/components/admin/pricing-migration-review-panel").then((m) => ({
      default: m.PricingMigrationReviewPanel
    })),
  { loading: () => panelFallback }
);
const ControladoriaCasesAdminPanel = dynamic(
  () =>
    import("@/components/admin/controladoria-cases-admin-panel").then((m) => ({
      default: m.ControladoriaCasesAdminPanel
    })),
  { loading: () => panelFallback }
);
const EmailOutboundAdminPanel = dynamic(
  () =>
    import("@/components/admin/email-outbound-admin-panel").then((m) => ({
      default: m.EmailOutboundAdminPanel
    })),
  { loading: () => panelFallback }
);
const AuditLogsAdminPanel = dynamic(
  () =>
    import("@/components/admin/audit-logs-admin-panel").then((m) => ({
      default: m.AuditLogsAdminPanel
    })),
  { loading: () => panelFallback }
);

export const ADMIN_TABS = [
  { id: "usuarios", label: "Usuários" },
  { id: "orgaos", label: "Órgãos" },
  { id: "permissoes", label: "Permissões" },
  { id: "tipos-itens", label: "Tipos de itens" },
  { id: "tipos-contrato", label: "Tipos de contrato" },
  { id: "tipos-contratacao", label: "Tipos de contratação" },
  { id: "modelos-notificacao", label: "Modelos de notificação" },
  { id: "conferencia-identificacao", label: "Conferência identificação" },
  { id: "conferencia-precificacao", label: "Conferência precificação" },
  { id: "controladoria", label: "Controladoria" },
  { id: "email", label: "Configuração de e-mail" },
  { id: "auditoria", label: "Auditoria e logs" },
  { id: "backup", label: "Backup" }
] as const;

export type AdminTabId = (typeof ADMIN_TABS)[number]["id"];

const DEFAULT_TAB: AdminTabId = "usuarios";

function isValidTab(value: string | null): value is AdminTabId {
  return ADMIN_TABS.some((t) => t.id === value);
}

type Props = {
  users: UserRecord[];
  usersLoadErrors?: string[];
};

export function AdministracaoView({ users, usersLoadErrors = [] }: Props): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: AdminTabId = isValidTab(rawTab) ? rawTab : DEFAULT_TAB;

  const setTab = useCallback(
    (tab: AdminTabId) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (tab === DEFAULT_TAB) {
        sp.delete("tab");
      } else {
        sp.set("tab", tab);
      }
      const qs = sp.toString();
      router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Administração</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Usuários, catálogos centrais, permissões granulares, e-mail, auditoria e atalho para backup do sistema.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as AdminTabId)}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 p-1">
          {ADMIN_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="usuarios" className="mt-4">
          {activeTab === "usuarios" ? (
            <UsersView users={users} dataLoadErrors={usersLoadErrors} embedded />
          ) : null}
        </TabsContent>

        <TabsContent value="orgaos" className="mt-4">
          {activeTab === "orgaos" ? <OrganizationsAdminPanel /> : null}
        </TabsContent>

        <TabsContent value="permissoes" className="mt-4">
          {activeTab === "permissoes" ? <PermissionsAdminPanel /> : null}
        </TabsContent>

        <TabsContent value="tipos-itens" className="mt-4">
          {activeTab === "tipos-itens" ? <ItemTypesAdminPanel /> : null}
        </TabsContent>

        <TabsContent value="tipos-contrato" className="mt-4">
          {activeTab === "tipos-contrato" ? <ContractTypesAdminPanel /> : null}
        </TabsContent>

        <TabsContent value="tipos-contratacao" className="mt-4">
          {activeTab === "tipos-contratacao" ? <HiringTypesAdminPanel /> : null}
        </TabsContent>

        <TabsContent value="modelos-notificacao" className="mt-4">
          {activeTab === "modelos-notificacao" ? <NotificationTemplatesAdminPanel /> : null}
        </TabsContent>

        <TabsContent value="conferencia-identificacao" className="mt-4">
          {activeTab === "conferencia-identificacao" ? <IdentificationMigrationReviewPanel /> : null}
        </TabsContent>

        <TabsContent value="conferencia-precificacao" className="mt-4">
          {activeTab === "conferencia-precificacao" ? <PricingMigrationReviewPanel /> : null}
        </TabsContent>

        <TabsContent value="controladoria" className="mt-4">
          {activeTab === "controladoria" ? <ControladoriaCasesAdminPanel /> : null}
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          {activeTab === "email" ? <EmailOutboundAdminPanel /> : null}
        </TabsContent>

        <TabsContent value="auditoria" className="mt-4">
          {activeTab === "auditoria" ? <AuditLogsAdminPanel /> : null}
        </TabsContent>

        <TabsContent value="backup" className="mt-4">
          {activeTab === "backup" ? (
            <Card className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <DatabaseBackup className="mt-0.5 h-8 w-8 shrink-0 text-primary" aria-hidden />
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-foreground">Backup e migração</h2>
                  <p className="text-sm text-muted-foreground">
                    Exportação e restauração da base PostgreSQL, preferências do sistema, anexos e backup automático S3
                    continuam na tela dedicada.
                  </p>
                  <Button asChild className="gap-2">
                    <Link href="/backup">
                      <DatabaseBackup className="h-4 w-4" />
                      Abrir Backup e migração
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
