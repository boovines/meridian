import nextEnv from "@next/env";
import { Tracer } from "judgeval";
import { randomUUID } from "node:crypto";
import { initializeJudgment } from "../src/server/integrations/judgment";
import {
  onboardingCases,
  runOnboardingCase,
} from "../tests/fixtures/judgment-onboarding";

const live = process.argv.includes("--export");
const requested = process.argv
  .find((arg) => arg.startsWith("--cases="))
  ?.slice(8)
  .split(",");
const selected = requested
  ? onboardingCases.filter((c) => requested.includes(c.id))
  : onboardingCases;
if (
  !selected.length ||
  requested?.some((id) => !onboardingCases.some((c) => c.id === id))
)
  throw new Error("Select valid onboarding scenario IDs with --cases=id1,id2");
if (live) {
  nextEnv.loadEnvConfig(process.cwd());
  if (!(await initializeJudgment()))
    throw new Error("Judgment initialization failed; no samples executed.");
}
// Never use live provider credentials or metered production dependencies for these samples.
process.env.OPENAI_API_KEY = "SYNTHETIC-NOT-A-CREDENTIAL";
delete process.env.INFERENCE_BUDGET_USD;
delete process.env.INFERENCE_BUDGET_LEDGER;
process.env.EXTRACTION_PROVIDER = "openai";
process.env.EXTRACTION_REINSPECTION = "0";
const batch = `synthetic-onboarding-${randomUUID()}`;
console.log(
  JSON.stringify({
    synthetic: true,
    exporting: live,
    batch,
    scenarios: selected.map((c) => c.id),
    started_at: new Date().toISOString(),
  }),
);
try {
  for (const sample of selected) {
    const result = await runOnboardingCase(sample, batch);
    console.log(
      JSON.stringify({
        scenario: result.scenario,
        status: result.status,
        trace_id: result.trace_id,
        error: result.error,
      }),
    );
    if (result.status !== "completed")
      throw new Error(
        "Onboarding execution needs investigation; remaining samples were not sent.",
      );
    if (live) await Tracer.forceFlush();
  }
} finally {
  if (live) await Tracer.shutdown();
}
