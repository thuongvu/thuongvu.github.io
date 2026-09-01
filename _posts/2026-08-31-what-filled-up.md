---
layout: post
title: "What Filled Up First? Diagnosing LLM Inference Bottlenecks"
---

I took production traffic from Azure's LLM inference service and replayed it at a scale that fit a single Nvidia A100, preserving the original request sizes and arrival times.[^azure]

When I doubled the arrival speed of the requests, median time to first token (TTFT) jumped from 142 ms to 13.8 seconds.

I had a few theories about the cause, but rather than start tuning knobs, I wanted to reproduce different inference failure modes one at a time to learn what each one looks like.

I designed synthetic workloads to make different serving bottlenecks easier to see. Then I returned to the Azure replay to pattern match the bottleneck.[^setup]

The dataset provides request arrival timestamps and token counts from Azure's LLM inference services. For the lower load replay, I kept every tenth request from a ten-minute window. For the higher load replay, every fifth. This roughly doubled the arrival rate while preserving the timing.

I used the same set of signals:

| signal  | what it tells me                                                |
| ------- | --------------------------------------------------------------- |
| TTFT    | time from request arrival to its first token                    |
| ITL     | how fast tokens arrive once generation has started              |
| running | how many requests are in the scheduler's model execution batches |
| waiting | how many accepted requests are queued outside that set          |
| KV      | how full the allocated KV-cache is                              |

## How does a long prefill affect other requests?

My first workload tested what happens when a long prompt arrives while other requests are decoding. Processing a long prompt requires a lot of compute upfront during prefill. I wanted to see whether requests already decoding and newly arriving requests were impacted similarly.

During the middle of twelve requests decoding, I added three 10,000-token prompts to create sustained prefill work. Then I sent short new  requests during those prefills to measure the impact on newly arriving requests.

| role                       |   n | TTFT p50 | TTFT p90 | ITL p50 |
| :------------------------- | --: | -------: | -------: | ------: |
| requests already decoding  |  12 |    44 ms |    54 ms | 13.1 ms |
| short new requests         |  32 |   110 ms |   780 ms | 13.1 ms |
| long-prompt requests       |   3 |     ~1 s |        — |       — |

The long prompts themselves took about a second, which isn't surprising since they were 10,000 tokens long.

The impact was much larger on new arrivals. For the short new requests that arrived while the long prompts were in their prefill stage, TTFT p90 went from 211 to 780 ms.[^p90] Meanwhile requests that were already decoding were affected less: median ITL stayed around 13 ms, though tail ITL reached ~135 ms.[^prefill]

---

## What happens when decode load rises?

Next I used a simple decode-oriented workload: short prompts (~150 tokens) and ~320-token generations.

Then I increased the request arrival rate and watched what filled up first.

|                  | 80 ms arrivals | 40 ms arrivals |
| :--------------- | -------------: | -------------: |
| running (median) |             81 |            254 |
| TTFT p50         |          77 ms |      4,737 ms  |
| ITL p50          |        17.6 ms |          33 ms |
| KV (median)      |           6.4% |          19.4% |

At the lower arrival rate, the GPU handled the load comfortably. Then I doubled the arrival rate.

vLLM caps how many sequences it can process in a single iteration with `max_num_seqs` and I set it to 256. At the higher arrival rate, a median of 254 requests were in model execution batches so the scheduler spent most of its time near this limit. Meanwhile the KV cache was only 19% full. For this workload, the scheduler reached its sequence limit long before the KV cache ran out of space.

It was a strong clue but I wanted to test it directly. I lowered `max_num_seqs` to make it the constraint and see if the same pattern emerged. I took a workload that normally had about 12 requests being processed at once and reran it with `max_num_seqs=8`. This puts the cap below the workload's normal concurrency. If the sequence limit was causing the pattern, I expected the scheduler to top out at eight requests, TTFT to climb into seconds, and KV use to stay low.

It did. TTFT went from 174 ms to 12.1 seconds. The scheduler topped out at eight requests, while KV stayed below 2%. Lowering the sequence limit reproduced that failure mode. 

Next I flipped the experiment: could I make KV capacity become the bottleneck instead? I lowered `--gpu-memory-utilization` to 0.45, which reduced the space available for the KV cache. KV use rose from roughly 2–4% to 11–25%, but latency barely changed, and the number of requests in model execution batches stayed about the same.

So simply reducing available KV space hadn't changed the failure mode.

---

## Back to the Azure replay

The synthetic workloads gave me a few patterns to compare against. Now I returned to the request replay that started the investigation. The Azure requests were much larger and varied. Their median prompt was about 880 tokens, and p90 was around 3,600. A median of 117 requests were in model execution batches, while the waiting queue had a median of 59 requests. KV use was around 80% at median and peaked at 99.9%.

The workload shape mattered. The synthetic decode test used small, uniform requests and ran into the sequence limit first. The larger, more varied Azure requests put much more pressure on KV instead.

---

## The patterns side by side

By this point I had a few different internal patterns to compare.

| case                        | what is happening                                | main clue                                                            |
| --------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| lower-rate reference        | same workload at lower offered load              | TTFT low, KV low, model execution well below limit                   |
| prefill–decode interference | long prefill affects request classes differently | new-arrival TTFT spikes; requests already decoding much less affected |
| active-sequence limit       | requests in model execution approaches `max_num_seqs` | model execution near limit while KV has room                         |
| KV-capacity pressure        | request state fills available KV cache           | KV near full and waiting grows despite sequence headroom             |

The first is a reference case, not a failure mode. The second depends on workload mix. The last two show how different workloads can cause different limits to fill first.

That's the fun part of LLM inference: prefill, decode, scheduling, and KV cache pressure all interact. The workload determines how it plays out and which bottleneck appears first.

[^azure]: Stojkovic et al., "DynamoLLM: Designing LLM Inference Clusters for Performance and Energy Efficiency," HPCA 2025.
[^setup]: Qwen2.5-7B-Instruct, BF16, A100-PCIE-40GB, vLLM 0.27.1. `max_model_len=32768`, `max_num_seqs=256`, prefix caching disabled. Synthetic workloads were deterministic; the Azure replay used trace arrival times and token lengths, and requests arrived at their scheduled times regardless of how the server was performing.
[^prefill]: This is usually called prefill–decode interference. vLLM's scheduler already splits long prefills into chunks and mixes them with decode, which reduces this failure mode but does not remove it. DistServe goes further by running prefill and decode on different GPUs.
[^p90]: With 32 probe requests, p95 is essentially the single worst sample. p90 is a slightly more stable summary of the tail at this sample size.
