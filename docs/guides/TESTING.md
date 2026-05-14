# 🧪 TESTING.md

## 📱 TikTok Simulation
You don't need to be live on TikTok to test the integration.

### 1. The "Nút Test" (Test Button)
- In the **Gift Mapping** tab, each row has a "Test" button.
- Clicking this triggers the `POST /api/tiktok/test-trigger` endpoint.
- It simulates the gift event as if it came from the `tiktokService`.

### 2. Manual Simulation API
You can send a POST request to `http://localhost:9000/api/tiktok/simulate-gift`:
```json
{
  "giftId": "rose",
  "userName": "Tester"
}
```

## 🎥 OBS Overlay Testing
- Open the **Overlay** section in the app.
- Copy the Overlay URL.
- In OBS, create a **Browser Source** and paste the URL.
- Trigger a test gift from the app and verify the video plays in OBS.

## 🎙️ TTS Testing
- Ensure your system volume is up.
- In **Settings**, toggle the TTS switch.
- Trigger a test gift. The app should announce the donor's name.
- *Note: TTS uses Google's public API and requires an internet connection.*

## 🐛 Debugging Tips
- **Backend Logs**: Check the terminal running `npm run dev`.
- **Frontend Logs**: Press `Ctrl + Shift + I` in the Electron app to open Chrome DevTools.
- **WebSocket**: Use the "Network" tab in DevTools and filter by "WS" to see real-time messages on Port 9001.
