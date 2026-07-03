# Hotfix — Encoding Repair

## Scope

This hotfix repairs encoding corruption only. No application, OBS, queue, playback, Gift Mapping, pricing, or administration logic was changed.

## Files inspected

- `desktop/renderer/index.html`
- `desktop/renderer/js/home.js`
- `backend/public/effect-player-overlay.html`
- Notification strings and notification markup contained in the files above

## Findings

- All inspected files were structurally valid UTF-8.
- `desktop/renderer/js/home.js` contained text that had previously been decoded as Windows-1252/Latin-1 and then saved as UTF-8. Examples included `Vui lÃ²ng káº¿t ná»‘i`, corrupted Vietnamese accents, and corrupted emoji byte sequences.
- `desktop/renderer/index.html` contained correct Vietnamese UTF-8 text.
- `backend/public/effect-player-overlay.html` contained no corrupted UI strings.
- No Unicode replacement characters (`�`) were found.

## Repair performed

- Reversed only verified Windows-1252-to-UTF-8 mojibake sequences in `desktop/renderer/js/home.js`.
- Preserved already-correct Vietnamese strings introduced by recent phases.
- Restored notification messages, labels, comments, emoji, and UI template text without changing JavaScript behavior.
- Confirmed both HTML files declare `<meta charset="UTF-8">`.

## Verification

- Strict UTF-8 decoding succeeds for all three inspected files.
- No known mojibake sequences remain.
- No Unicode replacement characters remain.
- `desktop/renderer/js/home.js` passes `node --check`.
- The inline script in `effect-player-overlay.html` compiles successfully.
- HTML structure and JavaScript logic were not modified as part of the text repair.
