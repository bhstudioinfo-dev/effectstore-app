# LiveFlow System Guidelines & Knowledge

## VIP Avatar Frame Guidelines
Always follow the VIP Avatar Frame pipeline defined in [.agents/rules/vip-avatar-frames.md](file:///d:/effectstore-app-backup/.agents/rules/vip-avatar-frames.md):
1. **Source Master**: Apple ProRes 4444 `.mov` with Alpha (1000x1000) from `D:\HỦ QUÀ\khung\`.
2. **OBS Live Overlay**: WebM VP9 Alpha (`alpha_mode: 1`, `-b:v 4M`) played via `<video id="vip-overlay-frame-video">` in `backend/public/effect-player-overlay.html`.
3. **Desktop App Preview**: Lossless APNG (`khung_<name>_animated.png`) with 32-bit RGBA and `plays=0` to guarantee zero ghosting smudges and zero Electron video black-box issues.
4. **Static Snapshot**: RGBA PNG (`khung_<name>.png`).
5. **Layer Stacking Hierarchy**: Glow Aura (`z:1`) -> Avatar Image (`z:2`) -> Animated Frame (`z:5`) with intact inner bezel -> VIP Name (`z:10`).
