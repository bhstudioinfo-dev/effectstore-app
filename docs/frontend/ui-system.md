# 🎨 UI_RULES.md

## 💎 Design Philosophy: "Premium Pro"
The interface must feel professional, modern, and high-end. Use Glassmorphism, Neon glows, and high-quality blurs.

## 🎨 Styling Conventions (CSS Variables)
- `--primary`: `#a78bfa` (Purple)
- `--secondary`: `#ff6b35` (Orange)
- `--danger`: `#ef4444`
- `--bg-dark`: `#0b0f1a`
- `--glass-bg`: `rgba(255, 255, 255, 0.05)`
- `--glass-border`: `rgba(255, 255, 255, 0.1)`
- `--blur`: `blur(12px)`

## 🧱 Component Structure
- **Sections**: Each "Tab" is a `<section>` in `index.html`. Navigation is handled by toggling the `active` class.
- **Glass Card**: Use `.glass-card` for container elements.
- **Buttons**:
  - `.btn-primary`: Gradient background, slight glow on hover.
  - `.btn-outline`: Bordered with transparent background.
- **Notifications**: Use `this.showNotification(type, message)` in `home.js`. Do NOT use `alert()`.

## 📱 Responsive Rules
- **Desktop Only**: The app is designed for Electron (fixed or resizable window).
- **Layout**: Use Flexbox and Grid. Avoid fixed pixel widths for main containers. Use `rem` or `%` where possible.
- **Scrollbars**: Customized thin scrollbars to match the dark theme.

## 🔄 UI Patterns
- **Loading States**: Use skeleton loaders or blurred overlays during API calls.
- **Modals**: Glassmorphism overlays with `backdrop-filter`.
- **Transitions**: Every interaction should have a transition (e.g., `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`).

## 🛠️ Reusable Components
- **User Avatar**: Circular with gradient border based on rank (Admin/Pro/Business).
- **Status Badge**: Pill-shaped with status-specific colors (Connected = Green, Disconnected = Red).
- **Effect Card**: Standardized layout with icon, name, and price badge.
