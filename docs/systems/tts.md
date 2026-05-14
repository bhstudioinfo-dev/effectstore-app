# 🗣️ TTS (Text-to-Speech) System

## 🏗️ Architecture
- **Location**: Frontend-driven (`desktop/renderer/js/home.js`).
- **Engine**: Google Translate TTS API (Public).
- **Format**: `https://translate.google.com/translate_tts?ie=UTF-8&q={text}&tl=vi&client=tw-ob`.

## 🔄 The Speech Queue
To prevent overlapping audio, TTS uses a sequential queue:
1. `speakText(text)` adds the string to `this.ttsQueue`.
2. `processTTSQueue()` checks if `isProcessingTTS` is false.
3. It pops the first item and creates a new `Audio` object.
4. It sets `volume` based on `this.ttsVolume` (from localStorage).
5. It waits for the `onended` event before processing the next item.

## ⚙️ Configuration
- **Threshold**: Minimum coin value to trigger TTS for gifts.
- **Toggle**: Separate switches for Gifts, Follows, and Shares.
- **Volume**: Range 0.0 to 1.0.

## ⚠️ Limitations
- Requires an active internet connection to reach Google's servers.
- Subject to rate limiting if triggered too frequently (mitigated by the sequential queue).
- Does not use system-level voices (Web Speech API) as they lack quality in Vietnamese.
