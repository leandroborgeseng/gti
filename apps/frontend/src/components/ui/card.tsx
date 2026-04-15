import { PropsWithChildren } from "react";

export function Card({ children }: PropsWithChildren): JSX.Element {
  return <section className="rounded-xl border border-border bg-white p-4 shadow-sm">{children}</section>;
}
