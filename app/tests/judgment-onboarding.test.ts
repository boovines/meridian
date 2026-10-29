import { expect, it, vi } from "vitest";
import { Tracer } from "judgeval";
import { OpenTelemetry } from "@ai-sdk/otel";
import { registerTelemetry } from "ai";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  onboardingCases,
  runOnboardingCase,
} from "./fixtures/judgment-onboarding";

it("runs the real runtime and model adapter for varied synthetic packets without live services", async () => {
  vi.stubEnv("OPENAI_API_KEY", "SYNTHETIC-NOT-A-CREDENTIAL");
  vi.stubEnv("INFERENCE_BUDGET_USD", "");
  vi.stubEnv("EXTRACTION_PROVIDER", "openai");
  vi.stubEnv("EXTRACTION_REINSPECTION", "0");
  const exporter = new InMemorySpanExporter();
  // Explicit empty credentials disable remote export even on a configured laptop.
  // Importing the runtime before initializing tracing must still create spans.
  await Tracer.init({
    projectName: "SYNTHETIC-LOCAL-TEST",
    apiKey: "",
    organizationId: "",
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  registerTelemetry(new OpenTelemetry({ tracer: Tracer.getOTELTracer() }));
  try {
    for (const sample of onboardingCases) {
      const result = await runOnboardingCase(sample, "SYNTHETIC-OFFLINE-TEST");
      expect(result.status, sample.id).toBe("completed");
      expect(result.error).toBeNull();
      expect(result.report).toMatchObject({
        synthetic: true,
        preview: "SYNTHETIC ONBOARDING REPORT — not sent",
      });
      expect(result.human_responses).toBe(sample.id === "human-review" ? 1 : 0);
    }
    await Tracer.forceFlush();
    const spans = exporter.getFinishedSpans();
    const roots = spans.filter((s) => !s.parentSpanContext);
    expect(roots).toHaveLength(10);
    expect(
      spans.filter((s) => s.name === "approved_workflow_step"),
    ).toHaveLength(51);
    for (const root of roots) {
      expect(root.attributes["judgment.input"]).toContain('"scenario"');
      expect(root.attributes["judgment.input"]).not.toContain('"node_id"');
      expect(root.attributes["onboarding.synthetic"]).toBe("true");
    }
    for (const span of spans.filter(
      (s) => s.attributes["judgment.span_kind"] === "tool",
    )) {
      expect(span.attributes["judgment.input"], span.name).toBeTruthy();
      expect(span.attributes["judgment.output"], span.name).toBeTruthy();
    }
    const modelSpans = spans.filter(
      (s) => s.name === "interpret_document_model",
    );
    expect(modelSpans).toHaveLength(21);
    expect(spans.filter(s => s.name === "gmail_create_draft")).toHaveLength(1);
    expect(spans.filter((s) => s.name.startsWith("chat "))).toHaveLength(0);
    for (const span of modelSpans) {
      expect(span.attributes["judgment.usage.total_cost_usd"]).toBe(0);
      expect(
        JSON.parse(String(span.attributes["judgment.output"]))[0],
      ).toMatchObject({ role: "assistant", content: expect.any(String) });
    }
    const ids = new Set(spans.map((s) => s.spanContext().spanId));
    for (const span of spans.filter((s) => s.parentSpanContext))
      expect(ids.has(span.parentSpanContext!.spanId)).toBe(true);
  } finally {
    await Tracer.shutdown();
    vi.unstubAllEnvs();
  }
});
