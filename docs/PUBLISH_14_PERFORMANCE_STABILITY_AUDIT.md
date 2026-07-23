# Publish Audit 14 — Performance and Stability

No destructive load/stress test was run.

## Confirmed design behavior

| Area | Current behavior | Risk |
|---|---|---|
| effect video | one effect_player video at a time; clear on end/error/timeout | medium; OBS CEF memory not measured |
| queue | memory array, default max 500, priority sort on each insert | medium |
| dedupe | event-key map lazily expires after 5 min | low/medium; keys may be absent |
| WebSockets | heartbeat 30 s, max 50 clients, 64 KB payload | reasonable local bounds |
| reconnect | renderer creates reconnect timers; two `connectWebSocket()` definitions exist in `home.js` | listener/timer drift risk |
| overlays | gift menu polls layout about every 700 ms and also receives WS events | CPU/serialization risk |
| designer | full DOM rerenders, HTML strings, history up to 200 full JSON snapshots | high for large layouts |
| TTS | renderer array processes sequentially | no explicit queue cap |
| comments | session counter; DOM/live feed behavior in monolithic renderer | 1,000-event growth not measured |
| logs | backend log rotates 5 MB × 5; main-error log has no rotation | disk growth risk |
| GiftLog | Mongo records have no TTL/retention | unbounded DB growth |
| custom media | transcoded to max 15 s, 720×1280 VP9 | strong bound; conversion CPU intensive |
| commercial upload | up to 500 MB; no production size/duration policy beyond schema | high disk/CPU |

## Six-hour and burst risks

- Reconnect intervals/timeouts can accumulate if UI views reinitialize; teardown ownership is not centralized.
- TikTok listeners are replaced when a new client is created, but real reconnect cycles need heap/listener observation.
- `EffectQueue` has no backpressure feedback to TikTok and silently drops at capacity.
- A 100-gift streak may create multiple intermediate playback entries because media handling does not wait for `repeatEnd`.
- `broadcastToClients` sends every event to every identity, increasing work and exposing unrelated state.
- Layout polling serializes and compares large payloads repeatedly.
- TTS browser speech can stall; `ttsQueue` has no maximum, age limit or cancellation policy.
- Timeline/media sources and object URLs in admin proof views require revocation/cleanup review.

## Measurable production limits recommended

These are acceptance targets to validate, not claims:

- Queue: cap 100 customer-visible entries; reject/aggregate with explicit UI and metrics.
- TTS: cap 50 pending, expire messages older than 60 seconds.
- Comments: retain/render at most 500 recent DOM rows per session.
- Layout: maximum 200 root items, 500 total nested items, 2 MB serialized payload.
- Commercial effect: documented max 200 MB and 30 seconds unless product requirements justify more.
- Local custom effect: keep current 500 MB input warning/15-second output; target conversion cancellation and progress.
- Logs: rotate every log family; retain a bounded total (for example 100 MB) and bounded age.
- Database gift logs: TTL/retention or archive policy.
- Long-run acceptance: six hours with stable listener counts and <20% heap growth after GC-equivalent idle periods.
- Burst acceptance: 100 rapid gifts completes/drops deterministically with no overlap/deadlock.

## Verification required

Instrument Electron renderer/main/backend/OBS CEF CPU and memory; record queue depth/latency/drops; run 100 gifts, 1,000 comments, stalled TTS, missing media, OBS reconnect and six-hour soak on release hardware. Use synthetic connector fixtures, not destructive production traffic.

**Readiness: WORKING BUT UNTESTED / P1.**

