# Judgment Evaluations

Use this reference when creating or debugging evaluations.

## Workflow

1. Fetch current evaluation docs:

   ```bash
   curl -s https://docs.judgmentlabs.ai/documentation/evaluation/offline-testing.md
   curl -s https://docs.judgmentlabs.ai/documentation/evaluation/prompt-scorers.md
   ```

2. Define what behavior needs to be scored.

3. Start with a small set of examples that exercise that behavior.

4. Pick one scorer first:

   - Agent judge or hosted scorer for rubric-based natural-language judgment
   - Python Code judge for deterministic logic, custom dependencies, or trace inspection

5. Run locally while iterating, then expand the dataset and hosted workflows when the signal is useful.

## Example Shape

Keep examples focused on fields the scorer needs:

```python
from judgeval.data import Example

examples = [
    Example.create(
        input="Where is my package?",
        actual_output="Your package will arrive tomorrow at 10:00 AM.",
    )
]
```

## Scorer Selection

- Use Agent judges for qualitative rubrics such as helpfulness, policy adherence, or answer quality.
- Use Code judges for exact checks, business logic, custom library calls, or direct trace inspection.
- Use datasets when the user needs repeatable regression testing across many examples.

## Common Mistakes

- Creating a large evaluation suite before validating one useful scorer.
- Mixing local and hosted scorer flows without checking SDK support.
- Adding unnecessary fields to examples that no scorer reads.
- Treating one passing example as proof that the agent behavior is reliable.
