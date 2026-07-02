# UI Design System Guidelines

This document details the colors, typography, styles, layout boundaries, and design tokens of the EffectStore application.

---

## 1. Color Palette

The interface is built around a sleek, high-contrast dark space theme, punctuated by electric highlights and glassmorphism panel styles.

- **Background (App Deep Dark)**: `#09090e` / `#0a0a14`
- **Surface (Primary Cards)**: `#0f172a` (Slate-900) / `#1e293b` (Slate-800)
- **Primary Highlights**: `#a855f7` (Purple-500) / `#c084fc` (Purple-400)
- **Accent High-Contrast Cyan**: `#22d3ee` (Cyan-400) / `#06b6d4` (Cyan-500)
- **Accent Romance Pink**: `#ff007f` / `#ec4899` (Pink-500)
- **Text Color Primary**: `#ffffff` (White)
- **Text Color Secondary**: `#cbd5e1` (Slate-300) / `#94a3b8` (Slate-400)

---

## 2. Glassmorphism Design Tokens

- **Translucent Glass Background**: `background: rgba(255, 255, 255, 0.05);`
- **Blur Filter**: `backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);`
- **Glass Border**: `border: 1px solid rgba(255, 255, 255, 0.12);`
- **Obsidian Dark Matte**: `background: rgba(10, 10, 14, 0.92);`

---

## 3. Typography & Gradients

### Fonts
- **Primary Font**: `Inter, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`
- **Fallback**: System sans-serif.

### Gradients
- **Primary Action Gradient**: `linear-gradient(135deg, #a855f7, #06b6d4)` (Purple to Cyan)
- **Neon Pink Gradient**: `linear-gradient(90deg, #ff007f, #ec4899)`
- **Obsidian Dark Panel Gradient**: `radial-gradient(circle at center, rgba(168, 85, 247, 0.08) 0%, #0a0a14 100%)`

---

## 4. UI Layout Systems

### Sidebar Navigation Panel
- Fixed width: `260px`
- Navigation item background active: `linear-gradient(90deg, rgba(168, 85, 247, 0.15), transparent)`
- Hover transition: `background-color 0.2s ease`

### Card Layouts
- Border radius: `16px` or `24px`
- Drop shadow: `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);`

### Designer Inspector Sidebar (Right Side)
- Width: `320px`
- Panel groupings separated by thin separators (`border-top: 1px solid rgba(255, 255, 255, 0.05)`)
- Form elements: Compact input boxes with inline labels (width inputs set to `80px` to prevent text truncations).
