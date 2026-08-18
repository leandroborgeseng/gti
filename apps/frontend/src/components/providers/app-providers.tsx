"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useState } from "react";
import { Toaster } from "sonner";
import { GlobalLoadingProvider } from "@/components/ui/global-loading";

export function AppProviders({ children }: PropsWithChildren): JSX.Element {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1
          }
        }
      })
  );

  return (
    <QueryClientProvider client={client}>
      <GlobalLoadingProvider trackNavigation={false}>{children}</GlobalLoadingProvider>
      <Toaster richColors closeButton position="top-right" />
    </QueryClientProvider>
  );
}
