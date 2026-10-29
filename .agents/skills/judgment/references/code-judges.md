# Judgment Code judges

Use this reference when creating Python Code judges.

## Current support

Code judges are Python-first. Do not invent a TypeScript `Judge` subclass workflow unless the current docs say it exists.

Fetch the current docs before implementation:

```bash
curl -s https://docs.judgmentlabs.ai/documentation/evaluation/custom-scorers.md
```

## When to use a Code judge

Use a Code judge when scoring needs:

- deterministic business logic
- custom Python dependencies
- direct trace inspection
- structured numeric, binary, or categorical outputs

## Minimal pattern

```python
from judgeval.data import Example
from judgeval.judges import BinaryResponse, Judge

class ResolutionScorer(Judge[BinaryResponse]):
    async def score(self, data: Example) -> BinaryResponse:
        actual_output = data.get_property("actual_output")

        return BinaryResponse(
            value="resolved" in actual_output.lower(),
            reason="Checks whether the response says the issue was resolved.",
        )
```

## Trace-aware pattern

Check for trace data before reading spans:

```python
from judgeval.data import Example
from judgeval.judges import Judge, NumericResponse

class ToolCallScorer(Judge[NumericResponse]):
    async def score(self, data: Example) -> NumericResponse:
        if not data.trace or not data.trace.spans:
            return NumericResponse(value=0.0, reason="No trace data available.")

        tool_spans = [
            span for span in data.trace.spans
            if span.get("span_kind") == "tool"
        ]

        return NumericResponse(
            value=float(len(tool_spans)),
            reason=f"Agent made {len(tool_spans)} tool call(s).",
        )
```

## Packaging guidance

- Keep the scorer class in the entrypoint file.
- Add dependencies to `requirements.txt`.
- Run locally before uploading when possible.
- If using categorical responses, define the allowed categories in a custom response subclass.
