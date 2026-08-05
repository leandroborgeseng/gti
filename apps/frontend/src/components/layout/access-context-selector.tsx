"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GTI_TOKEN_COOKIE } from "@/lib/auth-cookie-name";
import {
  getAuthMe,
  getMyPermissions,
  getOrganizations,
  switchAccessContext,
  type AuthMe
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterMainNavGroups, MAIN_NAV_GROUPS } from "./main-nav-data";

const ALL_ORGS_VALUE = "__ALL_ORGS__";

function setAuthCookie(token: string): void {
  const maxAge = 60 * 60 * 24 * 7;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${GTI_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function contextLabel(me: AuthMe): string {
  const ctx = me.activeContext;
  if (!ctx) return me.role;
  return `${ctx.profileName} · ${ctx.organizationLabel}`;
}

function syncFromMe(data: AuthMe): { profileId: string; organizationValue: string } {
  return {
    profileId: data.activeContext?.profileId ?? data.profiles?.[0]?.id ?? "",
    organizationValue: data.activeContext?.allOrganizationsActive
      ? ALL_ORGS_VALUE
      : data.activeContext?.organizationId ?? ""
  };
}

export function AccessContextSelector(): JSX.Element | null {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string>("");
  const [organizationValue, setOrganizationValue] = useState<string>("");

  const meQuery = useQuery({
    queryKey: queryKeys.authMe,
    queryFn: getAuthMe
  });

  const orgsQuery = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: getOrganizations,
    enabled: Boolean(meQuery.data?.allOrganizations)
  });

  const me = meQuery.data;
  const profiles = me?.profiles ?? [];
  const linkedOrgs = me?.organizations ?? [];
  const allOrganizations = Boolean(me?.allOrganizations);

  useEffect(() => {
    if (!me) return;
    const next = syncFromMe(me);
    setProfileId(next.profileId);
    setOrganizationValue(next.organizationValue);
  }, [me]);

  const orgOptions = useMemo(() => {
    if (allOrganizations) {
      const fromCatalog = (orgsQuery.data ?? []).filter((o) => o.active);
      return fromCatalog.map((o) => ({ id: o.id, label: o.acronym ? `${o.acronym} · ${o.name}` : o.name }));
    }
    return linkedOrgs.map((o) => ({
      id: o.id,
      label: o.acronym ? `${o.acronym} · ${o.name}` : o.name
    }));
  }, [allOrganizations, linkedOrgs, orgsQuery.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error("Selecione um perfil.");
      const organizationId = organizationValue === ALL_ORGS_VALUE ? null : organizationValue || null;
      return switchAccessContext({ profileId, organizationId });
    },
    onSuccess: async (result) => {
      if (result.access_token) setAuthCookie(result.access_token);
      toast.success("Contexto atualizado.");
      setOpen(false);
      await qc.invalidateQueries();
      const permissions = await getMyPermissions().catch(() => null);
      router.refresh();
      const path = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
      if (permissions) {
        const groups = filterMainNavGroups(MAIN_NAV_GROUPS, permissions.role, permissions.keys);
        const allowedHrefs = new Set(groups.flatMap((g) => g.items.map((i) => i.href)));
        const stillAllowed =
          path === "/dashboard" ||
          path === "/perfil" ||
          path === "/manual" ||
          path === "/notas-versao" ||
          [...allowedHrefs].some((href) => path === href || path.startsWith(`${href}/`));
        if (!stillAllowed) {
          toast.message("A rota atual não está disponível neste contexto. Redirecionando ao painel.");
          router.push("/dashboard");
        }
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao trocar contexto")
  });

  if (!me || profiles.length === 0) return null;

  const label = contextLabel(me);
  const canSwitch = profiles.length > 1 || orgOptions.length > 1 || allOrganizations;

  if (!canSwitch && profiles.length === 1 && !allOrganizations && orgOptions.length <= 1) {
    return (
      <span
        className="hidden max-w-[14rem] truncate rounded-md border bg-background px-2.5 py-1.5 font-medium text-foreground lg:inline"
        title={label}
      >
        {label}
      </span>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && me) {
          const s = syncFromMe(me);
          setProfileId(s.profileId);
          setOrganizationValue(s.organizationValue);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-w-[16rem] justify-between gap-1.5 truncate font-medium"
          title={label}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Contexto ativo</p>
          <p className="text-xs text-muted-foreground">
            O perfil define as permissões; o órgão define o escopo dos dados.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Perfil</label>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger>
              <SelectValue placeholder="Perfil" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Órgão</label>
          <Select value={organizationValue} onValueChange={setOrganizationValue}>
            <SelectTrigger>
              <SelectValue placeholder="Órgão" />
            </SelectTrigger>
            <SelectContent>
              {allOrganizations ? (
                <SelectItem value={ALL_ORGS_VALUE}>Todos os órgãos</SelectItem>
              ) : null}
              {orgOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={mutation.isPending || !profileId}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Aplicando…" : "Aplicar contexto"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
