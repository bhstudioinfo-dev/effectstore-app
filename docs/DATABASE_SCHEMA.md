# Database Schema

MongoDB is accessed through Mongoose. No migrations are present; schema changes are direct code edits in `backend/models`.

## User
File: `backend/models/User.js`
- Important columns: `email` unique required, `password` required hash, `name`, `phone` required, `machineId`, `subscription`, `subscriptionExpiresAt`, `activeDevices`, `purchasedEffects`, `totalSpent`, `totalUses`, `isAdmin`, `isActive`, `createdAt`.
- Relationships: `purchasedEffects.effectId` references `Effect`.
- Business constraints:
  - Email uniqueness enforced by schema.
  - Login device limit enforced in route code by subscription.
  - Expired paid subscriptions are downgraded in `/api/auth/me`.
- Enums by convention: `subscription` uses `free`, `pro`, `business`; admin returned as `admin` but not a stored enum.

## Effect
File: `backend/models/Effect.js`
- Important columns: `name`, `category`, `price`, `originalPrice`, `discount`, `description`, `icon`, `fileUrl`, `previewUrl`, `thumbUrl`, filesystem paths, `duration`, `fileSize`, `rating`, `uses`, `isActive`, `isTrending`, `isFlashSale`, `flashSalePrice`, `flashSaleEndsAt`, `timeline`, `isComposite`, `createdAt`.
- Relationships: referenced by `User.purchasedEffects`, `GiftMapping.effectId`, and loosely by `GiftLog.effectId`.
- Business constraints: `name`, `category`, `price` required. Active catalog only returns `isActive: true`.

## Payment
File: `backend/models/Payment.js`
- Important columns: `userId`, `orderId` unique, `effectIds`, `proofImage`, `amount`, `hasProof`, `status`, `createdAt`.
- Relationships: `userId` is a string, not an ObjectId; approval attempts `User.findById(payment.userId)` then `User.findOne({ machineId: payment.userId })`.
- Enums by convention: `status` uses `pending`, `approved`, `rejected`.
- Business constraints: approval grants effect ownership or subscription based on `effectIds`.

## EffectRequest
File: `backend/models/EffectRequest.js`
- Important columns: `name`, `phone`, `description`, `status`, `createdAt`.
- Enums by convention: frontend references `pending`, `contacted`, `done`; backend only creates/list requests and does not implement status update.

## GiftMapping
File: `backend/models/GiftMapping.js`
- Important columns: `userId`, `sessionId`, `giftId` required, `giftName`, `giftIcon`, `effectId` required ref `Effect`, `effectName`, `isActive`, `createdAt`, `updatedAt`.
- Relationships: maps a user-owned TikTok gift id to an `Effect`.
- Business constraints: mapping count limits are enforced in `backend/routes/tiktok.js`.

## GiftLog
File: `backend/models/GiftLog.js`
- Important columns: `giftId`, `giftName`, `userId`, `userName`, `effectId`, `triggeredAt`, `sessionId`, `repeatCount`.
- Relationships: `effectId` is stored as `String`; route code calls `populate('effectId')`, which may not work as intended because the schema is not a ref.

## GiftConfig
File: `backend/models/GiftConfig.js`
- Important columns: `giftId` unique required, `giftName` required, `coins`, `isActive`, `updatedAt`.
- Business constraints: admin coin update routes upsert by `giftId`, but current route update code does not provide `giftName`, despite schema requiring it.

## OBSSettings
File: `backend/models/OBSSettings.js`
- Important columns: `host`, `port`, `password`, `updatedAt`.
- Business constraints: stores OBS password in plaintext. Treat as sensitive.

## Banner
File: `backend/models/Banner.js`
- Important columns: `filePath` required, `publicUrl` required, `uploadedAt`, `isActive`.
- Business constraints: route maintains a single active banner by replacing/deleting current file.

## License
File: `backend/models/License.js`
- Important columns: `licenseKey` unique required, `userId` ref `User`, `effectId`, `machineId`, `isActive`, `expiresAt`, `lastValidated`, `createdAt`.
- Current usage: model exists but no active route usage was found during this scan.
