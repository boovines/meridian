# Judgment Agent Testing

Use this reference when a user wants to regression test an agent before shipping
a model change, prompt change, tool change, routing change, or any other agent
configuration tweak.

The recommended flow is:

1. Pull a fixed Judgment dataset.
2. Run the agent locally over every dataset input.
3. Use `OfflineTracer` for each run so the full trace is stored in offline
   trace storage.
4. Collect the generated offline examples in memory.
5. Run one evaluation at the end over the collected offline examples.

This is ideal for pre-production checks because it exercises the real agent path
without sending experiment traces to live monitoring.

If the user's production agent is already traced with Judgment, this flow should
feel almost effortless: keep the existing `@Tracer.observe(...)`, `wrap(...)`,
framework integration, tool spans, LLM spans, and custom attributes exactly as
they are. In the offline test harness, swap the normal production tracer
initialization for `client.offline_tracer(...)`. The existing tracing elsewhere
can be left untouched.

If the agent is not already traced with Judgment, add tracing to the important
spans before building the offline test. At minimum, trace the agent entrypoint as
the root span. Add tool, retrieval, and LLM spans when the judge needs those
details to decide whether the agent behaved correctly.

## When to Use

- Comparing a new model against the current production model.
- Testing a prompt edit against a golden dataset.
- Validating changes to tools, retrieval, memory, routing, or agent config.
- Running CI checks that should fail when scorer thresholds fail.
- Investigating regressions while preserving full traces for every test case.

## Core Pattern

`OfflineTracer` behaves like the regular Judgment tracer for span collection, but
routes spans to the offline endpoint. Every completed root span appends one
`Example` to the caller-owned `dataset` list. That generated example includes:

- `offline_trace_id`, which links the evaluation example to the stored trace
- any static `example_fields` passed when creating the offline tracer, such as
  `input`, `golden_output`, `expected_output`, scenario tags, or metadata

Use `Judgeval.offline_tracer(...)` rather than creating `OfflineTracer`
directly. It reuses the client's credentials and project.

## Existing Traced Agent Path

When the user's production agent is already traced with Judgment, recommend this
path first:

1. Keep all existing agent instrumentation in place.
2. Create a separate offline test script, test file, or CI job.
3. Pull the Judgment dataset that contains the test inputs and expected fields.
4. In the loop, call `client.offline_tracer(...)` before invoking the existing
   agent entrypoint.
5. Flush after each run, shut down tracing after the loop, then evaluate the
   generated offline examples.

The important mental model: `OfflineTracer` changes where spans are exported and
adds `offline_trace_id` examples for evaluation. It does not require rewriting
the traced agent code if that code already uses Judgment tracing correctly.

Production-style setup might look like this:

```python
from judgeval import Tracer

Tracer.init(project_name="default_project")

run_agent(user_input)
```

The offline harness replaces that initialization with this per-example setup:

```python
client.offline_tracer(
    dataset=offline_examples,
    example_fields={
        "input": source["input"],
        "golden_output": source["golden_output"],
    },
)

run_agent(source["input"])
```

Do not remove existing `@Tracer.observe(...)` decorators, provider wrappers, or
framework integrations from the agent. Those spans are the signal that the
offline evaluation will inspect.

## If Tracing Is Not Already Installed

If the user's agent is not already traced with Judgment, add the tracing needed
for the test before relying on offline evaluation results:

- Trace the user-facing agent entrypoint as the root span.
- Use provider or framework integrations when available so LLM calls are
  captured with model, latency, token, and cost metadata.
- Add spans around high-signal tools, retrieval, routing, memory, and other
  decisions the judge may need to inspect.
- Add concise attributes for scenario, prompt version, model variant, route,
  or tool choice when those fields help compare runs.

Do not over-instrument first. Start with the root span plus the spans needed by
the planned judges, then expand if the traces do not contain enough evidence.

## Python Example

```python
from judgeval import Judgeval, Tracer
from judgeval.data import Example

client = Judgeval(project_name="default_project")

source_dataset = client.datasets.get(name="agent-regression")
if source_dataset is None:
    raise RuntimeError("Dataset not found: agent-regression")

offline_examples: list[Example] = []

for source in source_dataset:
    question = source["input"]

    client.offline_tracer(
        dataset=offline_examples,
        example_fields={
            "input": source["input"],
            "golden_output": source["golden_output"],
        },
    )

    try:
        run_agent(question)
    finally:
        # Flush before registering the next offline tracer.
        Tracer.force_flush()

Tracer.shutdown()

results = client.evaluation.create().run(
    examples=offline_examples,
    scorers=["Agent Quality"],
    eval_run_name="agent-regression-model-or-prompt-change",
)
```

The agent entrypoint should be traced as the root span, usually with
`@Tracer.observe(span_type="agent")` or the framework/provider integration the
application already uses. Hosted scorers can use `offline_trace_id` to inspect
the stored trace server-side. Code judges can also use the fields copied
into each generated example.

## Implementation Notes

- Before implementing an offline test harness, tell the user the plan: whether
  the agent is already traced, what initialization will be swapped, what dataset
  will be pulled, what judges will run, and whether CI assertions will be added.
- Pull the source examples with `client.datasets.get(name=...)` so the run is
  repeatable across local machines and CI.
- Keep the source dataset stable when comparing changes. The variable being
  tested should be the model, prompt, tools, or agent config, not the eval set.
- If the production agent is already traced, leave that tracing in place and
  only swap the test harness to use `client.offline_tracer(...)`.
- If the agent is not traced yet, add the root span and any tool, retrieval, or
  LLM spans required for the judges to evaluate behavior.
- Create or activate an offline tracer inside the loop before each agent run so
  `example_fields` can include that specific source example's input and labels.
- Call `Tracer.force_flush()` after each run in short-lived scripts/tests so the
  trace is exported before the next tracer registers.
- Call `Tracer.shutdown()` after the loop before running the evaluation.
- Run `client.evaluation.create().run(...)` once after all traces are collected,
  not once per input.
- Use `assert_test=True` for CI when scorer failures should fail the test run.
- Do not mix hosted scorer names and local `Judge` instances in the same
  evaluation call.

## CI Integration

Offline tests are a natural fit for CI when the user wants to verify that the
agent keeps performing at a certain level across a stable dataset. Use
`assert_test=True` so the test fails when any scorer fails its threshold.

```python
def test_agent_regression():
    offline_examples = collect_offline_examples()

    client.evaluation.create().run(
        examples=offline_examples,
        scorers=["Agent Quality"],
        eval_run_name="ci-agent-regression",
        assert_test=True,
    )
```

Use CI for a smaller high-signal dataset first. Larger suites can run nightly or
before release if they are too slow or expensive for every pull request.

## Judges for Offline Tests

The offline test needs judges or scorers that match the behavior the user wants
to protect. If the user already has judges in Judgment, use those scorer names
in `client.evaluation.create().run(...)`.

If the user does not already have judges:

- Explain that they can create judges in the Judgment platform.
- Offer to help design the rubric and fields the judge should inspect.
- If the Judgment MCP server is available, offer to create or configure the
  judges for them through MCP.
- If MCP is not available, provide the judge rubric and setup instructions so
  the user can add it in the platform.

Good offline-test judges are specific. Prefer "answers using only retrieved
policy context" or "correctly escalates refund requests" over a vague "quality"
judge. Offline judges read the stored trace by default via `offline_trace_id`.
When the judge should use additional `example_fields`, include those fields as
placeholder variables in the judge prompt. For example, if the offline tracer
sets `example_fields={"golden_output": ...}`, the judge prompt must reference
`{{golden_output}}` for the judge to compare against that expected answer.

## Common Variations

For model or prompt comparisons, usually encode the variant in
`eval_run_name`. This is enough when the goal is comparing evaluation runs in
Judgment:

```python
variant = "gpt-4.1-mini-new-system-prompt"

results = client.evaluation.create().run(
    examples=offline_examples,
    scorers=["Agent Quality"],
    eval_run_name=f"agent-regression-{variant}",
)
```

If a scorer expects direct fields like `actual_output`, attach the agent return
value to an example explicitly or adjust the scorer to read from the trace via
`offline_trace_id`. Prefer trace-backed scoring when the judge needs tool calls,
retrieval context, intermediate reasoning artifacts, latency, or model outputs
captured in spans.

## How to Explain Offline Testing to Users

When answering user questions, describe offline testing as a regression harness
for agents:

- The source dataset supplies stable inputs and expected fields.
- The existing traced agent runs normally, but under `OfflineTracer`.
- `OfflineTracer` exports traces to offline storage instead of production
  monitoring.
- Each root trace creates a new evaluation example with `offline_trace_id`.
- After the loop, Judgment evaluates all collected examples with the selected
  judges.
- The result is a repeatable before/after comparison for model, prompt, tool, or
  config changes.

If the user is worried about implementation cost, emphasize that an already
traced production agent usually only needs a test harness change. The agent's
existing tracing code can remain untouched.
