# 🗄️ DATABASE_SCHEMA.md

## 👤 User Collection
- **_id**: ObjectId
- **email**: String (Unique, Required)
- **password**: String (Hashed)
- **name**: String
- **phone**: String
- **machineId**: String (Hardware Binding)
- **subscription**: Enum ['free', 'pro', 'business', 'admin']
- **activeDevices**: [String] (List of allowed machine IDs)
- **purchasedEffects**: Array<{ effectId, purchasedAt, licenseKey }>
- **totalSpent**: Number
- **isAdmin**: Boolean
- **isActive**: Boolean

## 🎬 Effect Collection
- **name**: String
- **category**: String
- **price**: Number
- **originalPrice**: Number
- **icon**: String
- **duration**: Number (seconds)
- **encryptedFilePath**: String (Path to protected asset)
- **uses**: Number (Usage counter)
- **isTrending**: Boolean
- **isFlashSale**: Boolean

## 🔗 GiftMapping Collection
- **userId**: String (Reference to User)
- **giftId**: String (TikTok Gift ID)
- **giftName**: String
- **effectId**: ObjectId (Ref: Effect)
- **isActive**: Boolean

## 🎁 GiftMenu Collection
- **userId**: ObjectId (Ref: User)
- **name**: String
- **elements**: Array (Serialized Fabric.js objects)
- **config**: { width, height, backgroundColor }

## 💰 Payment Collection
- **userId**: String
- **amount**: Number
- **orderId**: String (Unique)
- **status**: Enum ['pending', 'completed', 'cancelled']
- **proofUrl**: String (Image of receipt)

## 📋 Relationships
- **User -> GiftMapping**: 1:N (A user has many gift mappings).
- **GiftMapping -> Effect**: N:1 (Multiple mappings can trigger the same effect).
- **User -> GiftMenu**: 1:N (A user can have multiple saved menu designs).
- **User -> PurchasedEffects**: Many-to-Many via the embedded array in User.

## ⚖️ Business Constraints
- **Device Limit**: Free users = 1, Pro = 2, Business = 5.
- **Mapping Limit**: Free users = 5, Pro = 20, Business = 100.
- **Admin**: The email `admin@effectstore.vn` is hardcoded as the root administrator.
