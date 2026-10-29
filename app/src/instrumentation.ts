export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeJudgment } =
      await import("./server/integrations/judgment");
    await initializeJudgment();
  }
}
