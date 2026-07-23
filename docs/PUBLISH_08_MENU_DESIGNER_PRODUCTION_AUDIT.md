# Publish Audit 08 — Menu Designer Production Audit

## Active architecture

- Controller/state: `desktop/renderer/js/gift-menu-designer.js` class `GiftMenuDesigner`.
- Contracts: `item-registry.js` (`MenuDesignerItemRegistry`), `coordinate-engine.js`.
- Shared rendering: desktop and backend copies of `shared-render-engine.js`.
- Inspector extraction: `inspector-engine.js`, with legacy in-class fallbacks still present.
- Persistence/API: `GiftMenuLayout`, routes in `backend/routes/tiktok.js`.
- OBS output: `backend/public/gift-menu-overlay.html` + `gift-menu-renderer.css`.

Older documents that describe wholly separate render branches are **DOCUMENTATION OUTDATED**; Phase 3B introduced shared render helpers. Two physical engine copies still require parity.

## Feature audit

| Area | Confirmed implementation | Status/risk |
|---|---|---|
| aspect ratios | registry/coordinate config and safe-area/export transforms | working, complex |
| drag/resize/rotate | canvas pointer handlers and handles | working; manual UX not verified |
| selection/multi-select | `selectedId`, `selectedIds`, shift selection | working |
| history | JSON snapshots, undo/redo, max 200 | working; memory growth risk |
| layers | reorder, visible, locked | working |
| save/load/activate/delete | Mongo layout routes + local fallback | working; concurrency risks |
| export | `saveAndExport` then `/api/obs/setup-gift-menu` | working; real OBS not verified |
| gift/text/media | registry and renderer support | working |
| goal widgets | goal bar/circle, boss, mystery, list, combo | partial live semantics |
| leaderboard widgets | contributor/podium/talent variants | partial |
| gift stack group | true parent with child gifts, arrange/ungroup | recent, high risk |
| stack orientation | vertical/horizontal, spacing, icon/text controls | implemented |
| stack scrolling/loop | shared render animation settings | implemented; long-run not verified |
| templates/premium | template query/use/publish and plan gates | partial; no cloud package/version |
| custom assets | upload/optimization for allowed image/animation media | partial plan inconsistency |
| inspector | basic/advanced/data/testing sections | hybrid extracted/fallback |

## Gift Stack Group

Current code and Phase 4A documentation confirm `gift-stack-group` as a parent item with embedded `children`, group/ungroup restoration metadata, orientation, spacing, label effects and looping. It is not merely the older peer `groupId`. The backend entitlement validator treats this as an advanced-layer feature.

## Designer versus OBS

Both sides use shared renderer contracts for active item types, but equivalence is not guaranteed:

- Desktop and backend have separate copies of `shared-render-engine.js`; no build step proves byte/parity synchronization.
- CSS is separate (`desktop/...gift-menu-designer.css` vs `backend/public/gift-menu-renderer.css`).
- Designer stage applies fit zoom/pan; OBS applies export viewport scale/letterbox offsets.
- Font assets exist in desktop, but OBS HTML/CSS must resolve packaged paths; the main HTML also uses remote Font Awesome.
- Polling and WebSocket updates can cause timing differences; overlay polls layout about every 700 ms.
- Animations restart when DOM/layout signature changes, so editor save/poll timing may differ from static preview.
- Media decoding, autoplay and loop behavior differ between Electron renderer and OBS CEF.
- Border/text-background mismatches have historical fixes; the current shared contract reduces but does not eliminate regression risk.

Exact pixel, font, animation and timing equivalence is **NOT VERIFIED** because no screenshot/OBS comparison was run.

## Data and security risks

- Large item objects are stored as untyped arrays/Mixed data; schema-level field validation is absent.
- UI uses substantial HTML string interpolation. Shared render helpers escape many text fields, but the large legacy class needs dedicated XSS fixtures.
- Layout save validates plan features but not a formal item schema or total payload complexity beyond Express’s 10 MB JSON limit.
- Active layouts are mirrored to a single JSON file for overlays, creating cross-user ambiguity if one backend serves multiple simultaneous users.

## Readiness

**WORKING BUT UNTESTED / P1.** Strongest recent subsystem, but release requires fixture-based render parity tests for every item type, multiple aspect ratios, save/reload, OBS CEF visual comparisons, six-hour animation/resource observation, and plan-gate bypass tests.

