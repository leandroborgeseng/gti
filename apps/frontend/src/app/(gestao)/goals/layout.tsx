import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";

import "@/styles/gti-exec-metric-dash.css";

const gestaoFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--chamados-font",
  display: "swap"
});

export default function GoalsLayout({ children }: { children: ReactNode }) {
  return <div className={gestaoFont.variable}>{children}</div>;
}
