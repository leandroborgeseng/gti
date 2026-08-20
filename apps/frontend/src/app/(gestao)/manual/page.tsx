import { ManualView } from "@/components/manual/manual-view";

/** Conteúdo estático do manual — sem force-dynamic para reduzir TTFB. */
export default function ManualPage(): JSX.Element {
  return <ManualView />;
}
