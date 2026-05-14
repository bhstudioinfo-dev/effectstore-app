# 🛠️ SETUP.md

## ⚙️ Prerequisites
Ensure you have the following installed on your development machine:
- **Node.js**: v18.x or later.
- **MongoDB**: v6.x or later (Running locally on `27017` by default).
- **FFmpeg**: Must be added to your system PATH (used by `ffprobe` for video metadata).
- **OBS Studio**: v29.x or later with WebSocket enabled (v5.x).

## 🚀 Installation

### 1. Clone & Install Dependencies
```powershell
# Install Backend dependencies
cd backend
npm install

# Install Frontend/Electron dependencies
cd ../desktop
npm install
```

### 2. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
PORT=9000
MONGODB_URI=mongodb://localhost:27017/effectstore
JWT_SECRET=your_super_secret_key
OBS_HOST=127.0.0.1
OBS_PORT=4455
OBS_PASSWORD=obs123
ADMIN_DEFAULT_PASSWORD=admin123
```

### 3. Running the App
```powershell
# From the root directory
npm run dev
```
*Note: This command uses `concurrently` to start both the backend and electron app.*

## 🧪 Verification
- Open the app.
- Check the **System Status** dashboard.
- If OBS and Backend show "Connected", you are ready to develop.
