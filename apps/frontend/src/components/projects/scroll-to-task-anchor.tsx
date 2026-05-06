"use client";

import { useEffect, type ReactElement } from "react";

const RETRY_MS = 120;
const RETRY_MAX = 50;

function scrollToTaskFromHash(): (() => void) | void {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw.startsWith("task-")) return;
  const id = `project-task-${raw.slice("task-".length)}`;
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      window.clearInterval(timer);
    } else if (attempts >= RETRY_MAX) {
      window.clearInterval(timer);
    }
  }, RETRY_MS);
  return () => window.clearInterval(timer);
}

/** Quando o URL tem `#task-{uuid}`, faz scroll até a linha da tarefa no quadro (carregamento pode ser assíncrono). */
export function ScrollToTaskAnchor(): ReactElement | null {
  useEffect(() => {
    let cancel: void | (() => void);
    const run = (): void => {
      if (typeof cancel === "function") cancel();
      cancel = scrollToTaskFromHash();
    };
    run();
    window.addEventListener("hashchange", run);
    return () => {
      window.removeEventListener("hashchange", run);
      if (typeof cancel === "function") cancel();
    };
  }, []);
  return null;
}
