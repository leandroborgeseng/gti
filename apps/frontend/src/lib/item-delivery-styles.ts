import type { ContractItemDeliveryStatus } from "@/lib/api";

/** Texto — alinhado ao resumo por contrato em Funcionalidades (rose / amber / emerald). */
export function itemDeliveryLabelClass(status: ContractItemDeliveryStatus): string {
  switch (status) {
    case "NOT_DELIVERED":
      return "text-rose-700 dark:text-rose-400";
    case "PARTIALLY_DELIVERED":
      return "text-amber-700 dark:text-amber-400";
    case "DELIVERED":
      return "text-emerald-700 dark:text-emerald-400";
    default:
      return "text-muted-foreground";
  }
}

/** Gatilho do Select: borda e fundo suaves na mesma família de cores. */
export function itemDeliverySelectTriggerClass(status: ContractItemDeliveryStatus): string {
  const ring =
    "focus:outline-none focus:ring-1 focus:ring-offset-0 focus:ring-offset-background disabled:opacity-50";
  switch (status) {
    case "NOT_DELIVERED":
      return `font-medium ${itemDeliveryLabelClass(status)} border-rose-200 bg-rose-50/80 dark:border-rose-800/90 dark:bg-rose-950/40 ${ring} focus:ring-rose-300 dark:focus:ring-rose-700`;
    case "PARTIALLY_DELIVERED":
      return `font-medium ${itemDeliveryLabelClass(status)} border-amber-200 bg-amber-50/75 dark:border-amber-800/90 dark:bg-amber-950/35 ${ring} focus:ring-amber-300 dark:focus:ring-amber-700`;
    case "DELIVERED":
      return `font-medium ${itemDeliveryLabelClass(status)} border-emerald-200 bg-emerald-50/75 dark:border-emerald-800/90 dark:bg-emerald-950/35 ${ring} focus:ring-emerald-300 dark:focus:ring-emerald-700`;
    default:
      return `font-medium text-muted-foreground ${ring}`;
  }
}

/** Cada opção na lista do Select (Radix usa data-[highlighted]). */
export function itemDeliverySelectItemClass(status: ContractItemDeliveryStatus): string {
  switch (status) {
    case "NOT_DELIVERED":
      return "text-rose-700 data-[highlighted]:bg-rose-100 data-[highlighted]:text-rose-900 focus:bg-rose-100 focus:text-rose-900 dark:text-rose-300 dark:data-[highlighted]:bg-rose-950/55 dark:data-[highlighted]:text-rose-50 dark:focus:bg-rose-950/55 dark:focus:text-rose-50";
    case "PARTIALLY_DELIVERED":
      return "text-amber-800 data-[highlighted]:bg-amber-100 data-[highlighted]:text-amber-950 focus:bg-amber-100 focus:text-amber-950 dark:text-amber-300 dark:data-[highlighted]:bg-amber-950/50 dark:data-[highlighted]:text-amber-50 dark:focus:bg-amber-950/50 dark:focus:text-amber-50";
    case "DELIVERED":
      return "text-emerald-800 data-[highlighted]:bg-emerald-100 data-[highlighted]:text-emerald-950 focus:bg-emerald-100 focus:text-emerald-950 dark:text-emerald-300 dark:data-[highlighted]:bg-emerald-950/50 dark:data-[highlighted]:text-emerald-50 dark:focus:bg-emerald-950/50 dark:focus:text-emerald-50";
    default:
      return "";
  }
}
