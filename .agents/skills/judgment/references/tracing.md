# Judgment Tracing

Instrument LLM and agent applications with Judgment tracing, following best
practices and tailored to the user's codebase.

## When to Use

- Setting up Judgment tracing in a new project
- Auditing existing Judgment tracing
- Adding observability to LLM calls, tools, agents, or workflows
- Debugging missing traces, flat traces, or malformed span hierarchies

## Workflow

### 1. Assess Current State

Check the project:

- Is `judgeval` installed?
- What language and runtime are used? Python, TypeScript, serverless, worker,
  CLI, web server, or multi-service app?
- What LLM frameworks or providers are used? OpenAI SDK, Anthropic, OpenRouter,
  LangGraph, OpenAI Agents SDK, Claude Agent SDK, Google ADK, Vercel AI SDK,
  LiveKit, OpenTelemetry, OpenLit, OpenInference, etc.
- Is there existing tracing or OpenTelemetry instrumentation?
- Where is the real execution path? Find the route, job, CLI command, queue
  consumer, or agent entrypoint that users actually run.

Useful search:

```bash
rg -n "judgeval|Judgment|Tracer|wrap\\(|OpenAI|Anthropic|LangChain|LangGraph|Vercel|ai\\(|responses\\.create|chat\\.completions" .
```

**No integration yet:** Set up Judgment using a framework or provider
integration if available. Integrations capture more context automatically and
require less code than manual instrumentation.

**Integration exists:** Audit against the best practices below.

**No matching integration:** Initialize tracing once, then manually observe the
root request or agent function plus high-signal tool, retrieval, and LLM calls.

### 2. Apply Tracing Best Practices

Use these best practices to decide what to implement and which docs to fetch.

#### Baseline Best Practices

| Best practice               | When it applies                                                  | Docs                                                                                         | Why                                                                   |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Tracer init                 | Always                                                           | https://docs.judgmentlabs.ai/documentation/performance/tracing                               | Prevents missing spans, duplicate setup, and auth bugs                |
| LLMs tracked properly       | App calls LLMs                                                   | https://docs.judgmentlabs.ai/documentation/integrations/introduction#model-providers         | Makes model behavior, cost, latency, and failures debuggable          |
| Tool calls tracked properly | App has tools, retrieval, data access, or side-effectful helpers | https://docs.judgmentlabs.ai/documentation/performance/tracing                               | Shows what the agent actually did before responding                   |
| Simple span types           | Always                                                           | https://docs.judgmentlabs.ai/sdk-reference/python/trace/tracer                               | Keeps traces easy to scan and filter                                  |
| Session context             | App has conversations or multi-turn workflows                    | https://docs.judgmentlabs.ai/documentation/performance/tracing#grouping-traces-into-sessions | Groups related traces into sessions for conversation-level debugging  |
| Customer context            | App has customers, tenants, workspaces, or customer users        | https://docs.judgmentlabs.ai/sdk-reference/python/trace/tracer#set_customer_id               | Attributes traces to affected customers for customer-level debugging  |
| Setting your own attributes | Always                                                           | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      | Makes traces readable in the UI                                       |
| Export lifecycle            | Scripts, CLIs, jobs, tests, and servers                          | https://docs.judgmentlabs.ai/sdk-reference/typescript/tracer                                 | Prevents missing traces in short-lived runs and broken server tracing |

Framework and provider integrations handle model name, token usage, and span
types automatically when supported. Prefer integrations over manual
instrumentation.

Customer context syntax:

- Python: `Tracer.set_customer_id(customer_id)` and
  `Tracer.set_customer_user_id(customer_user_id)`
- TypeScript: `Tracer.setCustomerId(customerId)` and
  `Tracer.setCustomerUserId(customerUserId)`

#### Advanced Best Practices

Only apply these when the project architecture calls for them:

| Best practice                       | When it applies                                                                | Docs                                                                               | Why                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tracer across project semantics     | Tracing spans multiple files or modules                                        | https://docs.judgmentlabs.ai/sdk-reference/python/trace/tracer                     | Preserves one coherent trace across the codebase                          |
| Active tracers with project names   | Multiple Judgment projects are needed                                          | https://docs.judgmentlabs.ai/documentation/performance/tracing#project-routing     | Keeps staging, prod, or customer traces in the right place                |
| Distributed tracing                 | Requests cross stateless service, worker, queue, serverless, or RPC boundaries | https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing | Keeps downstream spans connected when in-memory context cannot carry over |
| Agent subtracing with linked traces | Agents delegate to subagent                                     | https://docs.judgmentlabs.ai/documentation/performance/tracing#subagent-tracing    | Splits subagents into their own traces for independent evaluation        |

### 3. Explore Traces First

Once baseline instrumentation is working, encourage the user to explore their
traces in the Judgment UI before adding more context:

"Your traces are now appearing in Judgment. Take a look at a few of them. See
what data is being captured, what's useful, and what's missing. This will help
us decide what additional context to add."

This helps the user:

- Understand what they're already getting
- See whether the trace tree matches the real workflow
- Form opinions about what's missing
- Ask better questions about what they need

Code inspection can find likely setup, but real verification requires a fresh
trace and evidence from Judgment. Encourage the user to configure MCP or the CLI
so the agent can check traces directly, then use the UI for human review.

**Preferred: MCP verification**

- Use `list_projects` if the project ID or name is unclear.
- Call `discover_schema` once, then use `sql_query` for every trace check
  below.
- Query `telemetry.traces` to find the newest trace, or filter by session ID,
  customer ID, or trace name, and to check session, duration, status, and basic
  trace metadata.
- Query `telemetry.spans` for the trace ID to inspect the root span, `llm`
  spans, `tool` spans, inputs, outputs, model metadata, cost, token usage,
  errors, attributes, and nesting.
- Query `telemetry.traces` grouped by `session_id` to verify `session_id`
  grouping.

**Fallback: CLI verification**

```bash
judgment traces search <PROJECT_ID> --pagination '{"limit":25,"cursorSortValue":null,"cursorItemId":null}'
judgment traces get <PROJECT_ID> <TRACE_ID>
judgment traces spans <PROJECT_ID> <TRACE_ID>
judgment sessions trace-ids <PROJECT_ID> <SESSION_ID>
```

**Also guide UI review**

Ask the user to open Monitoring > Traces or Monitoring > Sessions and inspect
the same evidence. UI review is useful even when MCP/CLI verification succeeds
because it helps the user decide what context is useful or missing.

Inspect:

- Does the root span correspond to the user-facing request or agent run?
- Do tool, retrieval, and LLM spans appear as children instead of unrelated flat
  traces?
- Are model name, token usage, latency, cost, and errors visible where expected?
- Does the trace input/output explain behavior without exposing secrets?
- If this is a conversation, does the session page group the expected turns?

### 4. Discover Additional Context Needs

Determine what additional instrumentation would be valuable. Infer from code
when possible, only ask when unclear.

**Infer from code:**

| If you see in code...                                                        | Infer                      | Suggest                                      |
| ---------------------------------------------------------------------------- | -------------------------- | -------------------------------------------- |
| Conversation history, chat endpoints, message arrays                         | Multi-turn app             | `session_id`                                 |
| User authentication, `user_id` variables                                     | User-aware app             | `user_id` or stable internal user identifier |
| Customer, org, workspace, or tenant identifiers                              | Multi-tenant app           | `customer_id`, `tenant_id`, or plan tier     |
| Multiple routes, tools, agents, or product features                          | Multi-feature app          | `feature`, `route`, or agent name attribute  |
| A/B tests, model routing, prompt variants                                    | Experimented app           | experiment, prompt, or model-family tag      |
| Feedback collection, ratings, thumbs up/down                                 | Has user feedback          | capture as scores                            |
| Stateless HTTP handlers, workers, queues, serverless functions, or RPC calls | Distributed app            | distributed tracing with `service.name`      |
| Environment-specific projects                                                | Needs project routing      | active tracers with project names            |
| Traced functions spread across modules                                       | Cross-file instrumentation | one tracer init, observed functions          |
| Agent delegation, subagents, or subsystems                                   | Multi-agent app            | agent spans or linked subtraces              |

**Only ask when not obvious from code:**

- "What would you want to filter by in the Judgment UI?" -> Surfaces non-obvious
  tags
- "Are there different user or customer segments you'd want to compare?" ->
  Customer tiers, plans, regions, or tenants
- "Should staging and production traces live in separate Judgment projects?" ->
  Determines whether project routing is needed
- "Does one request cross a stateless HTTP, worker, queue, serverless, or RPC
  boundary?" -> Determines whether distributed tracing is needed
- "How do you know when a response is good vs bad?" -> Determines whether to
  follow up with a score or a label

**Additions and their value:**

| Addition                         | Why                                                                 | Docs                                                                                         |
| -------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `session_id`                     | Groups multi-turn conversations together                            | https://docs.judgmentlabs.ai/documentation/performance/tracing#grouping-traces-into-sessions |
| `user_id` or customer identifier | Enables user, customer, and tenant filtering                        | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      |
| `feature` or route attribute     | Enables per-feature debugging and dashboards                        | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      |
| Explicit input/output            | Makes traces readable and avoids dumping sensitive args             | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      |
| Project routing                  | Routes staging, prod, or other environments intentionally           | https://docs.judgmentlabs.ai/documentation/performance/tracing#project-routing               |
| `service.name`                   | Separates services in OpenTelemetry and distributed flows           | https://docs.judgmentlabs.ai/documentation/performance/tracing#opentelemetry-integration     |
| Distributed trace propagation    | Connects stateless downstream service spans to the original request | https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing           |
| Agent linked traces              | Links delegated agent/subsystem work back to the parent trace       | https://docs.judgmentlabs.ai/documentation/performance/tracing#subagent-tracing              |
| Labels or scores                 | Filter by label or score and track how often each label is applied  | https://docs.judgmentlabs.ai/documentation/judges/monitor-judge-results                      |

These are NOT baseline best practices. Only add what's relevant based on
inference or user input.

Implementation guidance:

- For `session_id`, set it on the root span of each trace in a conversation.
- For cross-file tracing, initialize `Tracer` once in startup/bootstrap code and
  observe functions where the real work lives.
- For project routing, switch the active project before a root span starts. Do
  not switch projects mid-trace.
- For distributed tracing, first confirm the trace crosses a process or service
  boundary where normal in-memory context will not propagate. Common cases are
  stateless HTTP services, serverless handlers, background workers, queue
  consumers, RPC calls, and separate containers. Use normal nested spans for
  functions/modules that run in the same process.
- When distributed tracing is needed, use SDK propagation helpers. Do not
  hand-roll trace headers unless the docs require it.
- For agent subtracing, check current SDK support for `span_type="agent"`,
  `fork=True`, or linked trace helpers before implementation.
- Use stable internal IDs instead of raw emails or names.

### 5. Guide to UI

After adding context, point users to relevant UI features:

- Traces view: See individual requests, span hierarchy, latency, cost, inputs,
  outputs, and errors
- Sessions view: See grouped conversations if `session_id` is added
- Labels: Filter traces or sessions by the labels judges applied
- Automations and alerts: Route failures, a "Judge applied label" condition, or
  thresholds into follow-up workflows
- Judgment Agent search: Ask the in-product agent to search traces, cite spans,
  and investigate failures

Suggested Judgment Agent questions:

- "Why did this trace fail?"
- "Find recent failed traces for this feature and summarize the shared root
  cause."
- "Which tool call is slow?"
- "Find similar traces."
- "What changed across this session?"

## Framework Integrations

Prefer these over manual instrumentation:

| Framework or provider | Integration style                              | Docs                                                                                      |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| LangGraph             | Framework integration                          | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/langgraph        |
| OpenAI Agents SDK     | OpenInference-based framework integration      | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/openai-agents    |
| Claude Agent SDK      | Agent SDK integration                          | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/claude-agent-sdk |
| Google ADK            | OpenTelemetry framework integration            | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/google-adk       |
| Vercel AI SDK         | OpenTelemetry exporter/telemetry               | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/vercel-ai-sdk    |
| LiveKit               | Agent framework integration                    | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/livekit          |
| OpenAI                | Provider wrap or OpenTelemetry instrumentation | https://docs.judgmentlabs.ai/documentation/integrations/model-providers/openai            |
| Anthropic             | Provider wrap or OpenTelemetry instrumentation | https://docs.judgmentlabs.ai/documentation/integrations/model-providers/anthropic         |
| OpenRouter            | OpenAI-compatible provider tracing             | https://docs.judgmentlabs.ai/documentation/integrations/model-providers/openrouter        |
| OpenLit               | Existing tracing provider integration          | https://docs.judgmentlabs.ai/documentation/integrations/tracing-providers/openlit         |
| OpenInference         | Existing tracing provider integration          | https://docs.judgmentlabs.ai/documentation/integrations/tracing-providers/openinference   |
| OpenLLMetry           | Existing tracing provider integration          | https://docs.judgmentlabs.ai/documentation/integrations/tracing-providers/openllmetry     |

Full list: https://docs.judgmentlabs.ai/documentation/integrations/introduction

## Always Explain Why

When suggesting additions, explain the user benefit:

```text
"I recommend adding session_id to your traces.

Why: This groups messages from the same conversation together.
You'll be able to see full conversation flows in the Sessions view,
making it much easier to debug multi-turn behavior.

Learn more:
https://docs.judgmentlabs.ai/documentation/performance/tracing#grouping-traces-into-sessions"
```

```text
"I recommend using distributed tracing for this request path.

Why: The request crosses the API service and worker, so without propagation
Judgment will show two unrelated traces. Propagating trace context keeps the
full request flow in one trace tree.

Learn more:
https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing"
```

## Common Mistakes

| Mistake                                        | Problem                                          | Fix                                                                   |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| No flush/shutdown in short-lived scripts       | Traces may never be sent                         | Call the documented flush/shutdown method before exit                 |
| Shutting down inside a server handler          | Later requests may stop tracing                  | Shutdown only on process teardown                                     |
| Flat traces                                    | Can't see which step failed                      | Use one root span with nested spans for tools, retrieval, and LLMs    |
| Generic trace names                            | Hard to filter                                   | Use descriptive names: `support-chat-turn`, `retrieve-documents`      |
| Logging sensitive data                         | Data leakage risk                                | Mask or omit PII, secrets, auth headers, and unnecessary raw payloads |
| Not explicitly setting input/output            | Trace input may be noisy or sensitive            | Set only relevant input/output for the root span                      |
| Manual instrumentation when integration exists | More code, less context                          | Use the matching framework or provider integration                    |
| Double-instrumenting the same model call       | Duplicate spans and confusing costs              | Use one instrumentation path per model call                           |
| Initializing tracing in every module/request   | Duplicate setup and export issues                | Initialize once in startup/bootstrap code                             |
| Missing `session_id` for chat apps             | Conversations do not group in Sessions           | Set `session_id` on each root trace in the conversation               |
| Switching projects mid-trace                   | Spans may route incorrectly or fail to switch    | Route before the root span starts                                     |
| Missing distributed propagation                | Downstream service appears as an unrelated trace | Inject and continue trace context across service boundaries           |
| Guessing SDK APIs from memory                  | Outdated code or mixed SDK generations           | Fetch docs and match the installed SDK version                        |
