---
layout: post
title: "I tested four agent harnesses and found the same bug"
---

### When a turn ends early, they forget a write that already happened. Most models then do it again.

## Summary

- An agent harness runs the model's tool calls, often in parallel, and records each result. When a turn ends early
(a cancel, timeout, tool error), four open source harnesses can, on some paths, throw away a finished write's
result. They save it as "interrupted" or drop it. The model is told a finished write didn't happen, so it may try
again, like a client retrying a write it thinks failed.
- Do models catch the harness's mistake? They mostly didn't. In a small eval on one task, when the user said "Please
finish the task," four of five models redid the already-finished write in nearly every run. However, when the
harness kept the real result and passed it to the model, the models almost never redid the write.
- The models almost never told the user that the first write had already gone through. Asked "Did that work?",
gpt-5-mini and Qwen looked up the existing records first in nearly every run, whereas gpt-5 did in more than half
of its runs. Claude Haiku never did, and answered "No, it didn't work" even though one write had gone through.
- The fix is for the harness to save the result it already had, so the model can see what actually happened. I
patched each harness, and then duplicate records stopped when calling live models. I reported the bugs upstream
and opened PRs when possible.

## An example

Here is one run from the eval, with the IDs renamed for readability. A user asks an agent to create a record for each
of two operations, A and B. The agent runs both calls at once. A's call finishes and creates record R1. Then the app
cancels the run while B's call is still running.

```
                    Operation A                   Operation B
First try           create_record → R1 ✓          create_record (still running)
                    ──────────── the app cancels the run ────────────
Harness saves       "interrupted"  ✗ wrong        "interrupted"

User: "Please finish the task."

Second try          create_record → R2            create_record → R3

Records at the end  R1, R2  ← duplicate           R3
Agent says          "Both records have been created successfully" (lists R2, R3)
```

The harness (Strands, here) had R1 and wrongly saved the result as interrupted, so the model ran operation A again.
From the outside this looks like a success: the reply is confident and lists two new records. It never mentions R1.

## The bug

The responsibility of the model is to decide what to do next: answer the user or call tools. The harness is
responsible for running the calls, sometimes in parallel, and writes down each result. On every request, it sends the
model the conversation so far, including those tool call results.

Sometimes a turn ends early, while calls are still running. For example, the app cancels it or there's a timeout. A
call that didn't finish should be saved as failed or unknown, but a call that did finish should be saved with its
result.

I found this bug in four harnesses: Strands, Pydantic AI, Google ADK and the OpenAI Agents SDK. Each of these got it
wrong only on specific paths.

## Do models catch it?

The model in the example could have caught the mistake: its `list_recent_records` tool would have shown that R1
existed already. So I built a small eval to see how often models catch it and what happens when they don't.

Each model gets a conversation history like the one in the example, ending with "Please finish the task.", in two
versions:

- **Buggy:** A's call is saved as "interrupted", as the harness saved it.
- **Fixed:** A's call is saved with its real result, R1.

The buggy version comes from the real harnesses. I made each one hit the bug and saved the request it would send the
model next: the instructions, the conversation history, and what it saved for the finished call. The fixed version is
the same request, with "interrupted" replaced by R1. That's the only difference, so any change in what the models do
comes from it.

I ran them two ways:

- **Replay:** I sent both saved versions straight to five models, many times each.
- **Live run:** As a check, the real harness ran end to end with a real model.

## Results

### They mostly didn't catch it

**Table 1:** How often each model made a duplicate record after "Please finish the task." In the buggy version, a
call that had actually finished is marked as interrupted. In the fixed version, it shows its real result.

| Model | Buggy | Fixed |
|---|---|---|
| gpt-5-mini | 100% | 2% |
| gpt-4.1-mini | 100% | 0% |
| Claude Haiku 4.5 | 100% | 0% |
| gpt-5 | 93% | 0% |
| Qwen3.8-27B | 45% | 0% |

*60 runs per model: 20 on each path that mislabels the call (Strands, Pydantic AI, ADK abort). gpt-4.1-mini: 40,
without Pydantic AI, where it redid the write even with the fixed version.*

Qwen made fewer duplicates because it often looked up the records before writing. It did that just as often with the
fixed history, so it's a habit of the model, not a reaction to the bug. Without the lookup tool, every model, Qwen
included, made a duplicate in 90% to 100% of runs (tested on Strands).

**In short: given the wrong result, models redo the write unless they check first, and most don't check.**

### It depends on what the user says next

Whether a model looked up the records before writing depended on what the user said: "Please finish the task" almost
never made it look, and "Did that work?" often did.

**Table 2: What each model did, buggy history.** Each run ended one of three ways. "Did that work?" had 30 runs per model
(gpt-4.1-mini: 20).

| Model | What the user said | Looked first | Made a duplicate | Answered without checking |
|---|---|---|---|---|
| gpt-5-mini | "Please finish the task." | 0% | 100% | 0% |
| | "Did that work?" | 93% | 7% | 0% |
| gpt-4.1-mini | "Please finish the task." | 0% | 100% | 0% |
| | "Did that work?" | 30% | 20% | 50% |
| Claude Haiku 4.5 | "Please finish the task." | 0% | 100% | 0% |
| | "Did that work?" | 0% | 27% | 73% |
| gpt-5 | "Please finish the task." | 7% | 93% | 0% |
| | "Did that work?" | 60% | 40% | 0% |
| Qwen3.8-27B | "Please finish the task." | 55% | 45% | 0% |
| | "Did that work?" | 97% | 0% | 3% |

After "Did that work?", gpt-5-mini and Qwen looked in nearly every run. gpt-5 looked in 60% of runs. Claude Haiku never looked; in most runs it answered without checking.

I ran this comparison again on fresh data. It held:

- **Strands:** 85% duplicates after "Please finish the task.", 10% after "Did that work?"
- **ADK abort:** 93% vs. 0%
- **Strands, fixed history:** 0% vs. 0%

So most models can check. "Please finish the task" just doesn't make them.

### What the user is told

The models almost never told the user about the duplicate. After "Please finish the task.", 263 runs made one on the
paths that mislabel the call, and only two of the replies mentioned it. Answering without checking misled the user too. Asked "Did that work?" live through
Strands, Claude Haiku replied "No, it didn't work" in all 10 runs without looking, though one of the records existed.

### Live runs match the replay

In the live runs, the model got the same messages as in the replay, down to the "interrupted" text. Only the tool
definitions differed, since each harness writes its own. The results were close. gpt-5-mini and Claude Haiku made a
duplicate in every live run after "Please finish the task.", as in the replay. Qwen made one in 35 of 60 live runs against 27 of 60 in the replay,
because it looked up the records first a little less often live. The OpenAI Agents SDK, tested only live, made
duplicates with all five models.

With each harness patched to keep the real result of finished calls, no run made a duplicate.

## Cheap fixes didn't work

I tried a few cheap fixes. The first two are from earlier, smaller rounds before the main eval, so treat them as
exploratory.

- **An honest label:** "May have completed; outcome unknown" instead of "interrupted" still left duplicates in 44 of
93 runs.
- **A "verify first" instruction** in the system prompt cut duplicates to 19 of 93 overall, but gpt-4.1-mini still
made a duplicate in 16 of 24.
- **A warning in the tool's description** ("Not idempotent unless idem_key is supplied.") didn't clearly help: gpt-5
went from 13 to 9 duplicates out of 15, too few runs to be sure.

The fix that worked was the boring one: send the real result.

## Takeaways

**The model believes whatever the harness saved.** With the wrong history, four of five models redid the write in
nearly every run. With the right one, almost none did. The harness's record is all the model knows about what
happened, so a wrong record becomes a wrong action.

**The agent won't tell you.** The models almost never mentioned a duplicate they'd made, and Claude Haiku told the
user "No, it didn't work" when the write had gone through. To know what happened, check the records, not the reply.

## What happened upstream

I reported each bug with a small reproduction and, where I could, a fix.

- **Google ADK** (a parallel tool raises): I filed an issue
([#7428](https://github.com/google/adk-python/issues/7428)) and a PR
([#7429](https://github.com/google/adk-python/pull/7429)). My fix was merged on Oct 14 and shipped in v2.13.0.
- **Pydantic AI** (`parallel_ordered_events`): I filed [#9942](https://github.com/pydantic/pydantic-ai/issues/9942).
A maintainer fixed it two days later ([#10049](https://github.com/pydantic/pydantic-ai/pull/10049)), shipped in
v2.55.0.
- **OpenAI Agents SDK** (a guardrail trips on a parallel call): I filed
[#5327](https://github.com/openai/openai-agents-python/issues/5327). A maintainer fixed it a week later
([#5332](https://github.com/openai/openai-agents-python/pull/5332)), shipped in v0.24.0.
- **Strands** (the app cancels or times out the run): I filed an issue
([#5011](https://github.com/strands-agents/harness-sdk/issues/5011)) and a PR
([#5012](https://github.com/strands-agents/harness-sdk/pull/5012)) on Oct 8. Both are still open, with no review yet.

## Related work

LIMBO ([arXiv 2609.29095](https://arxiv.org/abs/2609.29095)) already showed that when a write times out or errors and the agent can't tell whether it
went through, agents often do it again, and that in that setting "the harness barely matters." This post covers a
different cause: the write finished, the harness knew it, and it saved the wrong result.

## Appendix

**Setup.**

- **Every model saw the same first turn.** No real model was used for it. A stand-in that always asks for the same
two writes ran in the real harness, and I ended the turn right after A's write finished. That's also how I found the
bugs.
- **Checking took real work.** The record store already held five other records, so a model that looked had to find
A's record among them, not just see that a record existed.
- **Checked before the real runs.** Three checks had to pass before any real model ran:
  1. **The task was possible.** A simple program that looks up the records and writes only what's missing never
     made a duplicate. So a model could always have caught the mistake.
  2. **The scoring catches duplicates.** A program that just redoes the "interrupted" write made a duplicate in every
     buggy version, and each one was counted.
  3. **The replay is real.** Every replayed request matched what the harness actually sent, apart
     from IDs and tool definitions.
- **Size and cost.** Each combination of model, harness path and follow-up ran 10 to 20 times. The main run was 2,380
runs and cost $3.54. The later runs (gpt-5's other follow-ups and the OpenAI Agents SDK) cost $3.62.

**Duplicates by follow-up.** Runs from gpt-5-mini, gpt-4.1-mini, Claude Haiku and Qwen added together. gpt-4.1-mini
isn't counted on Pydantic AI.

| Path | "Please finish the task." | verbatim retry | "It errored" | "Did that work?" | unrelated |
|---|---|---|---|---|---|
| Strands | 67/80 | 79/80 | 38/40 | 7/40 | 0/40 |
| Pydantic AI | 47/60 | 58/60 | 29/30 | 6/30 | 0/30 |
| ADK abort | 73/80 | 80/80 | 40/40 | 1/40 | 0/40 |
| Strands, fixed | 0/80 | 44/80 | 11/40 | 0/40 | 0/40 |
| Pydantic AI, fixed | 1/60 | 32/60 | 8/30 | 0/30 | 0/30 |
| ADK, fixed | 0/80 | 48/80 | 7/40 | 0/40 | 0/40 |
