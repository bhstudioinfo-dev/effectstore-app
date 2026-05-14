# 🤖 ai-workflow.md

## 🚀 1. The Starting Protocol
Every new AI session **MUST** start by reading these files in this specific order:
1. **[docs/00-start-here.md](../00-start-here.md)** (Entry point).
2. **[docs/management/ai-workflow.md](./ai-workflow.md)** (Current protocol).
3. **[docs/management/progress.md](./progress.md)** (Active status).

## 🔋 2. Token-Efficiency Rules (CRITICAL)
To maximize the value of the context window and minimize costs/latency:

### 📥 Selective Context Loading
**NEVER** load the entire repository. Use the following clusters:
- **UI/UX**: `docs/frontend/` + `desktop/renderer/js/home.js`.
- **Integrations**: `docs/systems/{system}.md` + `backend/services/{system}Service.js`.
- **Data/Logic**: `docs/core/` + `backend/models/`.
- **API**: `docs/api/` + `backend/routes/`.

### 🗜️ Concise Interaction
- **Summarize first**: Provide a 1-sentence summary of what you are about to do.
- **Diffs only**: When modifying large files (like `home.js`), use targeted `replace_file_content` instead of rewriting the entire file.
- **Avoid Over-Explanation**: Do not explain standard code patterns (e.g., how an Express route works) unless asked.

## 🛡️ 3. Architecture Drift Prevention
- **Stay Classy**: Maintain the `EffectStoreApp` class structure in `home.js`.
- **Stay Modular**: New logic should go into new files in `renderer/js/` instead of bloat into `home.js`.
- **Stay "Premium"**: Always use CSS variables from `main.css`.

## 📋 4. Documentation Lifecycle
Implementing a feature is only 80% of the task. The remaining 20% is:
1. Update **[docs/management/progress.md](./progress.md)**.
2. If logic changed, update the relevant file in **docs/core/** or **docs/systems/**.
3. Update the corresponding Vietnamese translation in **docs/vi/**.

## 🔄 5. Continuity strategy
When handing over to another agent or session:
- **Current Task**: Status of the work.
- **Next Steps**: Explicit list for the next agent.
- **Blockers**: Any technical hurdles found.

---
*Optimized for Large-Scale Long-Term AI Development.*
