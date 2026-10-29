# Judgment Docs Access

Use this reference when looking up Judgment documentation or SDK details.

## Documentation Index

Start with the LLM index to discover relevant pages:

```bash
curl -s https://docs.judgmentlabs.ai/llms.txt
```

## Fetch Specific Pages

Fetch likely pages directly when the task is clear:

```bash
curl -s https://docs.judgmentlabs.ai/documentation/performance/tracing.md
curl -s https://docs.judgmentlabs.ai/documentation/evaluation/offline-testing.md
curl -s https://docs.judgmentlabs.ai/documentation/evaluation/custom-scorers.md
curl -s https://docs.judgmentlabs.ai/sdk-reference/python.md
curl -s https://docs.judgmentlabs.ai/sdk-reference/typescript.md
```

## Search Workflow

1. Use `llms.txt` to find candidate pages.
2. Fetch the specific page as markdown.
3. Prefer examples from the current docs over remembered SDK patterns.
4. If the docs and existing code disagree, explain the mismatch and ask which SDK version the project uses.

## Useful Topics

- Tracing: `https://docs.judgmentlabs.ai/documentation/performance/tracing`
- Agent judges: `https://docs.judgmentlabs.ai/documentation/evaluation/prompt-scorers`
- Code judges: `https://docs.judgmentlabs.ai/documentation/evaluation/custom-scorers`
- Datasets: `https://docs.judgmentlabs.ai/documentation/evaluation/datasets`
- Python SDK reference: `https://docs.judgmentlabs.ai/sdk-reference/python`
- TypeScript SDK reference: `https://docs.judgmentlabs.ai/sdk-reference/typescript`
