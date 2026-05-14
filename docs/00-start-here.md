# 🚀 00-start-here.md

## 🎯 Welcome to EffectStore
This is the single entry point for understanding the EffectStore project. All developers (Human and AI) should start here to ensure they have the correct context before reading or writing code.

## 📚 Documentation Structure
We use a modular documentation system located in `/docs` to minimize context noise and improve AI efficiency.

- **[file-map.md](./file-map.md)**: Visual overview of the repository and file responsibilities.
- **[stack-decisions.md](./stack-decisions.md)**: Why we chose our current tech stack and design patterns.
- **[do-not-touch.md](./do-not-touch.md)**: Critical systems that require extreme caution or explicit approval to modify.

## 📁 Modular Context Folders
- **/core**: Fundamental business logic, architecture, and data schemas.
- **/api**: Communication protocols and endpoint references.
- **/frontend**: UI/UX rules and "Premium Pro" styling tokens.
- **/systems**: Deep-dives into [OBS](./systems/obs.md), [TikTok](./systems/tiktok.md), [TTS](./systems/tts.md), and [Overlay](./systems/overlay.md).
- **/guides**: Installation, testing, and troubleshooting procedures.
- **/management**: Project status, bugs, and [AI Workflow](./management/ai-workflow.md).
- **/vi**: Vietnamese human-readable versions.

## 🤖 AI Agent Workflow
1. Read **00-start-here.md** (this file).
2. Consult **[docs/management/ai-workflow.md](./management/ai-workflow.md)** for the standardized operating procedure.
3. Check **[docs/management/agent-rules.md](./management/agent-rules.md)** for development constraints.
4. Locate the relevant module for your task (e.g., `/api` for backend work).
5. Verify current state in **[docs/management/progress.md](./management/progress.md)**.

---
*Last Refactored: 2026-05-14*
