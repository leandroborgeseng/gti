"use client";

import { useQuery } from "@tanstack/react-query";
import { getAuthMe, type AuthMe } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

const AUTH_ME_STALE_MS = 5 * 60_000;

/** Cache compartilhado de `/auth/me` (shell, seletor de contexto, etc.). */
export function useAuthMe(options?: { enabled?: boolean }) {
  return useQuery<AuthMe>({
    queryKey: queryKeys.authMe,
    queryFn: getAuthMe,
    staleTime: AUTH_ME_STALE_MS,
    enabled: options?.enabled ?? true
  });
}
