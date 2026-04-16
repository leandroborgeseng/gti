export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }
  if (process.env.GLPI_SKIP_BOOTSTRAP === "1") {
    return;
  }
  try {
    const { bootstrapGlpiSyncInNext } = await import("./src/glpi/sync-cron");
    await bootstrapGlpiSyncInNext();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[instrumentation] Arranque GLPI ignorado:", msg);
  }
}
