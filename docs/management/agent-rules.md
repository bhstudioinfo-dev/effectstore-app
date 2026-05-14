# 🤖 AGENT_RULES.md

## ⚠️ CRITICAL RULES
1. **Never Refactor Unrelated Files**: Only modify files directly related to the current task.
2. **Preserve Architecture**: Do not change the class-based structure of `home.js` or the singleton pattern in services.
3. **Avoid Duplication**: Check existing utility functions in `home.js` (like `formatPrice` or `showNotification`) before writing new ones.
4. **No Direct Asset Access**: Always use the stream API (`/api/stream/effect/:id`) for video content. Never try to access `/effects/encrypted/` files directly.
5. **Secret Management**: Never hardcode credentials. Use `process.env` in the backend and `localStorage` for frontend tokens.
6. **Database Integrity**: Ask the user before modifying Mongoose schemas.
7. **Design Parity**: Always use the defined CSS variables and Glassmorphism patterns. Never introduce plain red/blue/green colors.

## 🛠️ Development Workflow
- **Validation**: After editing `home.js` or `index.html`, remind the user to restart the Electron app or press `Ctrl + R` to clear the cache.
- **Error Handling**: Every API call must have a `.catch()` block.
- **Sequential Playback**: Never bypass the `effectQueue.js` when triggering effects in OBS.
- **Code Style**: Maintain the "Premium Pro" naming conventions and HSL-based styling.

## 📦 Dependencies
- **Minimalism**: Avoid installing new NPM packages unless absolutely necessary. Check if an existing package can do the job first.
- **Production Safety**: Ensure `devDependencies` and `dependencies` are correctly categorized in `package.json`.
