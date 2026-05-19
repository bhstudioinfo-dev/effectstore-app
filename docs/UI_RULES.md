# UI Rules

## UI Patterns
- The main product UI is a desktop-first Electron app, not a responsive marketing site.
- Primary navigation is a left sidebar plus main content views inside `desktop/renderer/index.html`.
- View switching is handled by `EffectStoreApp.switchView()` and global helpers in `desktop/renderer/js/home.js`.
- Use the existing dark premium visual language: glass panels, subtle borders, purple/pink/gold accents, and status colors.
- Prefer existing notification helpers such as `app.showNotification(type, message)` over `alert()`, though older standalone pages still use alerts.

## Component Structure
- Main app shell: `desktop/renderer/index.html`.
- Main app logic: `desktop/renderer/js/home.js`.
- Main stylesheet: `desktop/renderer/styles/main.css`.
- Standalone pages:
  - `desktop/renderer/gift-mapping.html`
  - `desktop/renderer/gift-coins-manager.html`
  - `desktop/renderer/admin.html`
  - `desktop/renderer/admin-banner.html`
  - `desktop/renderer/overlay.html`

## Styling Conventions
- Existing CSS uses CSS variables in `main.css`, inline styles in `index.html`, and page-local styles in standalone HTML files.
- Keep changes local to the relevant page/component; do not start a new design system without consolidating existing CSS first.
- Continue using Inter font where already present.
- Existing buttons, cards, badges, modals, status cards, effect cards, and admin tables should be extended rather than duplicated.
- The app currently uses Font Awesome in the main renderer. Match that icon source unless intentionally migrating the whole UI.

## Responsive Rules
- Electron window is configured with `width=1400`, `height=900`, `minWidth=1200`, `minHeight=800` in `desktop/main.js`.
- Main UI can assume desktop dimensions but should not overflow at the configured minimum size.
- Standalone gift mapping and gift coins pages contain some responsive rules; preserve them.
- Avoid introducing fixed content widths that exceed 1200px unless contained in scrollable regions.

## Reusable Components and Patterns
- Status cards: TikTok, OBS, launcher connection cards in `index.html` and updated by `home.js`.
- Effect card/list rendering: centralized in `home.js`; use existing render functions before adding new markup.
- Modals: generic modal, effect detail modal, edit effect modal, timeline modal patterns already exist in `index.html`.
- Cart sidebar: fixed right drawer in `index.html`.
- Admin tables: dashboard/user/payment/request tables in `home.js` and `admin.html`.
- Gift cards/effect cards for mapping: exist both in main app and `gift-mapping.html`.

## Before Editing UI
- Check `git status`; current renderer files may contain user edits.
- Search existing markup/classes before adding components.
- Keep API URL handling consistent with `this.API_URL` in `home.js` where possible.
- If adding a new standalone page, register it in Electron navigation in `desktop/main.js`.
- If changing renderer behavior, manually test the relevant view through Electron or the static page plus backend.
