# 📘 PROJECT_OVERVIEW.md

## 🚀 App Purpose
EffectStore is an all-in-one automation and engagement platform for TikTok streamers. It allows streamers to enhance their live broadcasts by triggering visual effects on OBS Studio automatically when viewers send gifts on TikTok.

## 👥 Target Users
- **TikTok Streamers**: Who want to increase engagement and monetization through interactive effects.
- **Content Creators**: Looking for professional, automated visual enhancements.
- **Agencies**: Managing multiple streamers and looking for a centralized gift-effect management tool.

## 💼 Business Logic
- **Monetization**: Streamers buy effects from the "Store" using a credits system (totalSpent).
- **Automation**: Real-time listening to TikTok Live events.
- **Sequential Playback**: Ensuring multiple gifts trigger effects in a queue rather than overlapping.
- **Engagement**: Use of TTS (Text to Speech) to announce gifts and donors.
- **Security**: DRM protection for video assets via encrypted streaming.

## ✨ Current Features
- **Store**: Browse and purchase visual effects (WebM).
- **TikTok Integration**: Connect to live rooms and listen for gifts, likes, follows, and chats.
- **OBS Integration**: Direct control via OBS WebSocket to trigger browser sources.
- **Gift Mapping**: Custom logic to link specific TikTok gifts to specific purchased effects.
- **Gift Menu Designer**: A drag-and-drop tool to design custom gift menus for overlays.
- **TTS System**: Automatic announcement of gifts with customizable voices and thresholds.
- **Admin Dashboard**: For managing effects, banners, and user transactions.
- **Payment System**: Integrated VietQR payment flow for topping up balance.

## 💻 Tech Stack
- **Frontend**: Electron, HTML5, Vanilla CSS (Glassmorphism), Vanilla JS.
- **Backend**: Node.js, Express.js.
- **Database**: MongoDB (Mongoose).
- **Communication**: WebSocket (Port 9001), OBS WebSocket (Port 4455).
- **External APIs**: TikTok Live Connector, VietQR.

## 🚀 Deployment Info
- **Local Development**: `npm run dev` starts the backend and Electron app.
- **Production**: Electron builder used for packaging into `.exe` (Windows).

## 🌍 Environment Usage
- `.env` file handles:
  - `MONGODB_URI`
  - `PORT` (Default 9000)
  - `JWT_SECRET`
  - `OBS_HOST`, `OBS_PORT`, `OBS_PASSWORD`
  - `ADMIN_DEFAULT_PASSWORD`
