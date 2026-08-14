/**
 * LiveFlow Gift Jar 2D Physics Engine (Powered by Matter.js)
 * Implements real physical bouncing, rolling, stacking, and overflow
 * for TikTok Live gifts (Roses, Diamonds, Purple Orbs, Whales, Lions, and Top Donor Badges).
 */
(function(window) {
    'use strict';

    class GiftJarPhysics {
        constructor(container, options = {}) {
            this.container = typeof container === 'string' ? document.querySelector(container) : container;
            if (!this.container) return;

            this.options = Object.assign({
                autoResize: true,
                gravity: 1.0,
                jarRect: null
            }, options);

            this.items = [];
            this.wallBodies = [];
            this.isRunning = false;
            this.animFrameId = null;

            this.initCanvas();
            this.initPhysics();
            this.setupWalls();
            this.startLoop();
        }

        initCanvas() {
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'gift-jar-physics-canvas';
            this.canvas.style.cssText = `
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 10;
            `;
            this.ctx = this.canvas.getContext('2d');
            this.container.appendChild(this.canvas);
            this.resizeCanvas();

            if (this.options.autoResize) {
                this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
                this.resizeObserver.observe(this.container);
            }
        }

        resizeCanvas() {
            if (!this.canvas || !this.container) return;
            const rect = this.container.getBoundingClientRect();
            this.width = rect.width || window.innerWidth;
            this.height = rect.height || window.innerHeight;
            this.dpr = window.devicePixelRatio || 1;

            this.canvas.width = this.width * this.dpr;
            this.canvas.height = this.height * this.dpr;
            this.canvas.style.width = `${this.width}px`;
            this.canvas.style.height = `${this.height}px`;

            this.setupWalls();
        }

        initPhysics() {
            const { Engine, World } = Matter;
            this.engine = Engine.create({
                enableSleeping: false,
                gravity: { x: 0, y: this.options.gravity, scale: 0.001 }
            });
            this.world = this.engine.world;
        }

        setupWalls() {
            if (!this.world) return;
            const { Bodies, World } = Matter;

            // Remove old walls
            if (this.wallBodies.length) {
                World.remove(this.world, this.wallBodies);
                this.wallBodies = [];
            }

            const w = this.width;
            const h = this.height;

            // Screen Ground Floor
            const floor = Bodies.rectangle(w / 2, h + 25, w * 2, 60, { isStatic: true, friction: 0.4, label: 'floor' });
            const leftScreen = Bodies.rectangle(-25, h / 2, 60, h * 2, { isStatic: true, label: 'screen_left' });
            const rightScreen = Bodies.rectangle(w + 25, h / 2, 60, h * 2, { isStatic: true, label: 'screen_right' });
            this.wallBodies.push(floor, leftScreen, rightScreen);

            // Determine Jar Boundaries
            let jx = w / 2;
            let jy = h * 0.65;
            let jw = Math.min(320, w * 0.55);
            let jh = Math.min(380, h * 0.55);

            if (this.options.jarRect) {
                const r = this.options.jarRect;
                jx = r.x + r.w / 2;
                jy = r.y + r.h / 2;
                jw = r.w * 0.85;
                jh = r.h * 0.82;
            } else {
                const jarWidget = this.container.querySelector('.gmd-gift-jar-widget') || document.querySelector('.gmd-gift-jar-widget');
                if (jarWidget) {
                    const cRect = this.container.getBoundingClientRect();
                    const jRect = jarWidget.getBoundingClientRect();
                    jx = (jRect.left - cRect.left) + jRect.width / 2;
                    jy = (jRect.top - cRect.top) + jRect.height / 2;
                    jw = jRect.width * 0.82;
                    jh = jRect.height * 0.82;
                }
            }

            this.jarCenter = { x: jx, y: jy, w: jw, h: jh };

            const wallThickness = 18;
            const halfW = jw / 2;
            const halfH = jh / 2;

            // Jar Bottom
            const jarBottom = Bodies.rectangle(jx, jy + halfH - 10, jw * 0.76, wallThickness, {
                isStatic: true, friction: 0.3, label: 'jar_bottom'
            });

            // Jar Left Wall
            const jarLeft = Bodies.rectangle(jx - halfW + 12, jy + 15, wallThickness, jh * 0.72, {
                isStatic: true, friction: 0.15, angle: 0.05, label: 'jar_left'
            });

            // Jar Right Wall
            const jarRight = Bodies.rectangle(jx + halfW - 12, jy + 15, wallThickness, jh * 0.72, {
                isStatic: true, friction: 0.15, angle: -0.05, label: 'jar_right'
            });

            // Jar Neck Left Lip (curved funnel)
            const jarLipLeft = Bodies.rectangle(jx - halfW * 0.62, jy - halfH + 28, jw * 0.28, wallThickness, {
                isStatic: true, friction: 0.1, angle: -0.35, label: 'jar_lip_left'
            });

            // Jar Neck Right Lip (curved funnel)
            const jarLipRight = Bodies.rectangle(jx + halfW * 0.62, jy - halfH + 28, jw * 0.28, wallThickness, {
                isStatic: true, friction: 0.1, angle: 0.35, label: 'jar_lip_right'
            });

            this.wallBodies.push(jarBottom, jarLeft, jarRight, jarLipLeft, jarLipRight);
            World.add(this.world, this.wallBodies);
        }

        spawnBody(x, y, radius, type, data = {}) {
            const { Bodies, World, Body } = Matter;
            const spawnX = typeof x === 'number' ? x : (this.jarCenter.x + (Math.random() * 40 - 20));
            const spawnY = typeof y === 'number' ? y : -30;

            const restitution = type === 'rose' ? 0.2 : 0.32;
            const friction = type === 'rose' ? 0.15 : 0.1;

            const body = Bodies.circle(spawnX, spawnY, radius, {
                restitution,
                friction,
                frictionAir: 0.006,
                density: 0.002
            });

            body.giftType = type;
            body.giftData = data;
            body.giftRadius = radius;

            Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 2.5,
                y: Math.random() * 2 + 1
            });
            Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.1);

            World.add(this.world, body);
            this.items.push(body);

            // Limit total max items to prevent memory overhead
            if (this.items.length > 280) {
                const oldest = this.items.shift();
                World.remove(this.world, oldest);
            }

            return body;
        }

        spawnRose(x, count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    const offset = (Math.random() - 0.5) * 50;
                    this.spawnBody((x || this.jarCenter.x) + offset, -20 - (i * 15), 11, 'rose', {
                        emoji: '🌹',
                        size: 22
                    });
                }, i * 40);
            }
        }

        spawnDiamond(x, count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    const offset = (Math.random() - 0.5) * 40;
                    this.spawnBody((x || this.jarCenter.x) + offset, -30, 20, 'diamond', {
                        emoji: '💎',
                        size: 38
                    });
                }, i * 80);
            }
        }

        spawnPurpleOrb(x) {
            this.spawnBody(x || this.jarCenter.x, -40, 32, 'purple_orb', {
                label: 'Mãi Yêu',
                color: '#9333ea',
                size: 64
            });
        }

        spawnTiktokWhale(x) {
            this.spawnBody(x || this.jarCenter.x, -50, 36, 'tiktok_whale', {
                label: 'TikTok LIVE',
                color: '#0284c7',
                size: 72
            });
        }

        spawnLion(x) {
            this.spawnBody(x || this.jarCenter.x, -60, 48, 'lion', {
                emoji: '🦁',
                label: 'Sư Tử',
                color: '#d97706',
                size: 96
            });
        }

        spawnTopDonorBadge(rank = 1, nickname = 'Top Fan', avatarUrl = '', x) {
            this.spawnBody(x || this.jarCenter.x, -40, 28, 'top_donor', {
                rank: rank || 1,
                nickname: nickname || 'Top 1',
                avatarUrl,
                size: 56
            });
        }

        spawnRandomGift(tier = 'random', x) {
            if (tier === 'small') {
                this.spawnRose(x, Math.floor(Math.random() * 8) + 4);
            } else if (tier === 'medium') {
                const choice = Math.random();
                if (choice < 0.5) this.spawnDiamond(x, 2);
                else this.spawnPurpleOrb(x);
            } else if (tier === 'large') {
                const choice = Math.random();
                if (choice < 0.5) this.spawnTiktokWhale(x);
                else this.spawnLion(x);
            } else if (tier === 'top_donor') {
                this.spawnTopDonorBadge(1, 'Top 1 Supporter', '', x);
            } else {
                // Completely random realistic live stream drop
                const roll = Math.random();
                if (roll < 0.55) {
                    this.spawnRose(x, Math.floor(Math.random() * 12) + 3);
                } else if (roll < 0.75) {
                    this.spawnDiamond(x, 2);
                } else if (roll < 0.88) {
                    this.spawnPurpleOrb(x);
                } else if (roll < 0.96) {
                    this.spawnTiktokWhale(x);
                } else {
                    this.spawnLion(x);
                }
            }
        }

        startLoop() {
            if (this.isRunning) return;
            this.isRunning = true;
            let lastTime = performance.now();

            const loop = (currentTime) => {
                if (!this.isRunning) return;
                const delta = Math.min(32, currentTime - lastTime);
                lastTime = currentTime;

                Matter.Engine.update(this.engine, delta);
                this.render();

                this.animFrameId = requestAnimationFrame(loop);
            };

            this.animFrameId = requestAnimationFrame(loop);
        }

        render() {
            if (!this.ctx || !this.canvas) return;
            const ctx = this.ctx;
            const dpr = this.dpr || 1;

            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, this.width, this.height);

            // Render every active dynamic physical gift body
            for (let i = 0; i < this.items.length; i++) {
                const b = this.items[i];
                const { x, y } = b.position;
                const angle = b.angle;
                const r = b.giftRadius || 12;
                const type = b.giftType;
                const data = b.giftData || {};

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);

                if (type === 'rose') {
                    // Render 2D Realistic Rose
                    ctx.font = `${r * 2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(225, 29, 72, 0.6)';
                    ctx.shadowBlur = 4;
                    ctx.fillText('🌹', 0, 0);
                } else if (type === 'diamond') {
                    // Render Prismatic Diamond
                    ctx.font = `${r * 2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(56, 189, 248, 0.8)';
                    ctx.shadowBlur = 8;
                    ctx.fillText('💎', 0, 0);
                } else if (type === 'purple_orb') {
                    // Render Purple Orb "Mãi Yêu"
                    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
                    grad.addColorStop(0, '#f3e8ff');
                    grad.addColorStop(0.3, '#c084fc');
                    grad.addColorStop(0.8, '#7e22ce');
                    grad.addColorStop(1, '#3b0764');

                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
                    ctx.shadowBlur = 10;
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    // Text banner "Mãi Yêu"
                    ctx.fillStyle = '#fef08a';
                    ctx.font = `bold 10px "Inter", "Segoe UI", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = '#000000';
                    ctx.shadowBlur = 4;
                    ctx.fillText('Mãi Yêu 💜', 0, 0);
                } else if (type === 'tiktok_whale') {
                    // Render Blue TikTok LIVE Whale / Spiral
                    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
                    grad.addColorStop(0, '#e0f2fe');
                    grad.addColorStop(0.4, '#38bdf8');
                    grad.addColorStop(0.9, '#0369a1');
                    grad.addColorStop(1, '#082f49');

                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
                    ctx.shadowBlur = 12;
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = `900 9px "Inter", "Segoe UI", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = '#000000';
                    ctx.shadowBlur = 4;
                    ctx.fillText('TikTok LIVE 🌊', 0, 0);
                } else if (type === 'lion') {
                    // Render Grand Lion
                    ctx.font = `${r * 1.9}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(245, 158, 11, 0.9)';
                    ctx.shadowBlur = 14;
                    ctx.fillText('🦁', 0, 0);
                } else if (type === 'top_donor') {
                    // Render Circular Avatar Badge with Crown
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.fillStyle = 'linear-gradient(135deg, #f59e0b, #ef4444)';
                    ctx.fillStyle = '#f59e0b';
                    ctx.shadowColor = 'rgba(245, 158, 11, 0.9)';
                    ctx.shadowBlur = 10;
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = `900 10px "Inter", "Segoe UI", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`👑 TOP ${data.rank || 1}`, 0, 0);
                }

                ctx.restore();
            }

            ctx.restore();
        }

        reset() {
            if (!this.world) return;
            const { World } = Matter;
            if (this.items.length) {
                World.remove(this.world, this.items);
                this.items = [];
            }
        }

        destroy() {
            this.isRunning = false;
            if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
            if (this.resizeObserver) this.resizeObserver.disconnect();
            if (this.canvas && this.canvas.parentNode) {
                this.canvas.parentNode.removeChild(this.canvas);
            }
            if (this.engine) {
                Matter.World.clear(this.engine.world, false);
                Matter.Engine.clear(this.engine);
            }
        }
    }

    window.GiftJarPhysics = GiftJarPhysics;

})(typeof window !== 'undefined' ? window : this);
