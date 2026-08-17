"use client";

import { useQuery } from "@tanstack/react-query";
import { getMyPermissions, type MyPermissions } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

const PERMISSIONS_STALE_MS = 10 * 60_000;

/** Cache compartilhado das permissões do usuário autenticado. */
export function useMyPermissions(options?: { enabled?: boolean }) {
  return useQuery<MyPermissions>({
    queryKey: queryKeys.myPermissions,
    queryFn: getMyPermissions,
    staleTime: PERMISSIONS_STALE_MS,
    enabled: options?.enabled ?? true
  });
}
