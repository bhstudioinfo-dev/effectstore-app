# 🌐 API_FLOW.md

## 🔐 Authentication
- **Requirement**: `Authorization: Bearer <token>`
- **Middleware**: `authMiddleware` (validates JWT), `adminMiddleware` (validates isAdmin flag).

## 🛣️ Key Endpoints

### 1. Auth Flow
- `POST /api/auth/register`: Create user + return token.
- `POST /api/auth/login`: Validate credentials + check device limit.
- `GET /api/auth/me`: Fetch current user profile.

### 2. Effect Management
- `GET /api/effects`: Fetch all active effects.
- `GET /api/user/effects`: Fetch effects owned by the current user (Admins get all).
- `POST /api/effects` (Admin): Upload new effect with automatic encryption.
- `GET /api/stream/effect/:id`: Stream decrypted WebM video.

### 3. TikTok Live
- `POST /api/tiktok/connect`: Start listener for a specific Room ID.
- `GET /api/tiktok/mappings`: Fetch user's gift-to-effect mappings.
- `POST /api/tiktok/map-gift`: Create or update a mapping.

### 4. OBS Control
- `POST /api/obs/trigger`: Manually trigger an effect on OBS.
- `GET /api/system/status`: Check connection status of TikTok and OBS services.

## 📤 Request Format
- **Content-Type**: `application/json` for standard routes.
- **Multipart/Form-Data**: For Admin effect/thumb uploads.

## 📥 Response Format
```json
{
  "success": true,
  "data": { ... },
  "error": "Error message if success is false"
}
```

## 🔌 External Integrations
- **TikTok**: `tiktok-live-connector` (Scraping/Webhooks).
- **VietQR**: QR code generation for payments.
- **Google TTS**: Voice synthesis for donor announcements.
