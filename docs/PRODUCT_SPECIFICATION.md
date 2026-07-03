# Product Specification: BH Studio (EffectStore)

This document describes BH Studio (EffectStore) as a commercial software-as-a-service (SaaS) and desktop utility product.

---

## 1. Product Purpose & Target Audience

BH Studio is a live streaming interaction tool designed for content creators, stream agencies, and TikTok streamers. The product bridges live virtual gift events on TikTok to visual actions (overlays, goals, widgets) on stream, increasing viewer retention and stream monetization.

---

## 2. Core Commercial Modules

### A. Marketplace
An asset repository where users can browse high-quality overlays, transformation animations, and interaction packages. Users can preview WebM files and purchase them using virtual coins/credits.

### B. Gift Mapping Engine
The logic engine that binds gifts to visual effects. Streamers define complex conditions (spam cooling, group random selection, and combo tiers) to match interaction values.

### C. Effect Player Overlay
A chroma-keyable OBS browser overlay canvas. Plays optimized WebM animations in real time with high performance and support for alpha-transparency.

### D. Goal Board
An overlay widget displaying target bars (e.g., "50/100 Rose Goal"). Encourages viewer participation by tracking specific goals.

### E. Gift Menu Designer
A customization workspace allowing streamers to layout floating interactive widgets, customize frames, select fonts, and adjust rounded corners for OBS overlays.

### F. OBS Studio Integration
Local programmatic WebSocket connection to manage source alignment, scene overlays, and self-healing fixes.

### G. TikTok Integration
Real-time connector catching comment, like, follow, and gift socket feeds from TikTok Live servers.

### H. Membership & Subscription Tiers
Controls user entitlements and restrictions. Tiers include:
*   `FREE`: Basic store purchases, no custom effect uploads, basic gift mapping counts.
*   `VIP` / `PREMIUM`: Unlimited custom WebM uploads, advanced mapping rules (cooldowns, combos), and layout configurations.

### I. Admin Dashboard
Administrative backend for system operators to upload store assets, manage user balances, process subscriptions, and analyze transaction histories.

---

## 3. Business & Licensing Rules

1.  **Entitlements Verification**: API endpoints check the user's active subscription tier and credit balance prior to executing purchases, custom effect uploads, or activating mappings.
2.  **Asset Ownership**: Purchased effects are bound to a single user account and cannot be transferred or shared.
3.  **Local Execution Constraint**: To maintain performance, WebM overlays are served by the local desktop backend server and rendered directly via local OBS loopbacks.

---

## 4. Future Direction

*   **Platform Diversification**: Expand stream triggers to support YouTube Live, Facebook Gaming, and Twitch.
*   **Audio/TTS Integration**: Support text-to-speech triggers and custom audio alerts mapped to gift tiers.
*   **3D Avatar Anchors**: Interface mapped outputs to trigger facial changes or accessory spawns on virtual streamer avatars (Vtubers).
