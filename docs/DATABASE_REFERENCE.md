# Database Schema & Models Reference

This document maps all active Mongoose MongoDB collection models, their validation restrictions, relationships, and index configurations.

---

## 1. Schema Relationships

The database is built around a centralized `User` record, linking mappings, custom assets, menu layouts, goals, and transaction logs.

```
       [ User ] 
       /   |   \
      /    |    \
     /     |     \
[GiftMapping] [GiftMenuLayout] [Goal]
    |
(Refers to system Effects & User customEffects)
```

---

## 2. Models Detail

### A. User (`users` collection)
Stores account credentials, subscription properties, balance, and custom WebM media configurations.
*   **Schema Fields**:
    *   `name` (String, required)
    *   `email` (String, required, unique, indexed)
    *   `password` (String, required)
    *   `coins` (Number, default: 0)
    *   `subscriptionType` (String, enum: `['free', 'vip', 'premium']`, default: `'free'`)
    *   `subscriptionExpiresAt` (Date)
    *   `customEffects` (Array):
        *   `localId` (String, unique string key starting with `custom-`)
        *   `name` (String)
        *   `fileUrl` (String)
        *   `duration` (Number)
    *   `purchasedEffects` (Array):
        *   `effectId` (ObjectId, ref: `'Effect'`)
        *   `purchasedAt` (Date)

---

### B. Effect (`effects` collection)
Stores pre-designed marketplace WebGL/video assets uploaded by system admins.
*   **Schema Fields**:
    *   `name` (String, required)
    *   `fileUrl` (String, required)
    *   `thumbUrl` (String)
    *   `duration` (Number, required)
    *   `price` (Number, required)
    *   `category` (String, enum: `['transformation', 'gift', 'background', 'animation', 'pk', 'meme', 'team_heart']`)
    *   `isActive` (Boolean, default: true)

---

### C. Gift Mapping (`giftmappings` collection)
Matches TikTok Gift IDs to target effects with custom cooldowns and quantity bounds.
*   **Schema Fields**:
    *   `userId` (String, indexed)
    *   `giftId` (String, required)
    *   `giftName` (String)
    *   `giftIcon` (String)
    *   `effectId` (String, required)
    *   `effectName` (String)
    *   `effects` (Array):
        *   `effectId` (String)
        *   `effectName` (String)
        *   `weight` (Number, default: 1)
    *   `playbackMode` (String, enum: `['random', 'sequential']`, default: `'random'`)
    *   `minQuantity` (Number, default: 1)
    *   `maxQuantity` (Number, default: null)
    *   `exactQuantity` (Number, default: null)
    *   `cooldown` (Number, default: 0)
    *   `cooldownAction` (String, enum: `['queue', 'ignore']`, default: `'queue'`)
    *   `isActive` (Boolean, default: true)

---

### D. Gift Menu Layout (`giftmenulayouts` collection)
Stores designer layouts configured by streamers using the floating widget designer.
*   **Schema Fields**:
    *   `userId` (String, required, indexed)
    *   `theme` (String, default: 'dark')
    *   `borderRadius` (Number, default: 12)
    *   `opacity` (Number, default: 0.95)
    *   `items` (Array):
        *   `giftId` (String)
        *   `x` (Number)
        *   `y` (Number)
        *   `width` (Number)
        *   `height` (Number)

---

## 3. Index Registry

| Collection | Indexed Field | Index Type | Purpose |
| :--- | :--- | :--- | :--- |
| **users** | `email` | Unique | User registration check / login |
| **giftmappings** | `userId` | Standard | Retrieve streamer mappings |
| **giftmappings** | `giftId` | Standard | Match live TikTok socket feeds |
| **giftmenulayouts**| `userId` | Standard | Load customized layouts |
