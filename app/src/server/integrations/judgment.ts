import { OpenTelemetry } from "@ai-sdk/otel";
import { registerTelemetry } from "ai";
import { Tracer } from "judgeval";

export const judgmentProject = {
  name: "invoice agent",
  id: "5d2a6103-17c6-491a-96e7-4017dcb95bf1",
  organizationId: "bd6bb705-d647-45c9-ba5f-11e18ffe40fc",
} as const;

// Keep one initialization even across concurrent callers and development reloads.
const state = globalThis as typeof globalThis & {
  meridianJudgmentInitialization?: Promise<boolean>;
};

export function initializeJudgment(): Promise<boolean> {
  if (state.meridianJudgmentInitialization)
    return state.meridianJudgmentInitialization;
  const apiKey = process.env.JUDGMENT_API_KEY;
  if (!apiKey) return Promise.resolve(false);
  state.meridianJudgmentInitialization = (async () => {
    try {
      if (
        !apiKey.startsWith("jli_") ||
        process.env.JUDGMENT_ORG_ID !== judgmentProject.organizationId
      )
        throw new Error("Invalid Judgment configuration");
      const tracer = await Tracer.init({
        apiKey,
        organizationId: judgmentProject.organizationId,
        projectName: judgmentProject.name,
        environment: process.env.JUDGMENT_ENVIRONMENT || "development",
        resourceAttributes: { "service.name": "meridian-runtime" },
      });
      if (tracer.projectId !== judgmentProject.id) {
        await Tracer.shutdown();
        throw new Error("Unexpected Judgment project");
      }
      registerTelemetry(
        new OpenTelemetry({
          tracer: Tracer.getOTELTracer(),
          headers: false,
        }),
      );
      return true;
    } catch {
      // Observability must not change business outcomes or log credentials.
      console.warn(
        "Judgment tracing unavailable; check the ingest key, organization and project configuration.",
      );
      return false;
    }
  })();
  return state.meridianJudgmentInitialization;
}
