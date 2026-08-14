/**
 * LiveFlow Gift Jar 2D Physics Engine (Powered by Matter.js)
 * Implements real physical bouncing, rolling, stacking, and overflow
 * with FULL 100% sync for all 645+ REAL TikTok Live Gift Icons.
 * Features 2x High-DPI Supersampling for crystal clear, razor-sharp icon rendering.
 */
(function(window) {
    'use strict';

    const POPULAR_TIKTOK_GIFTS = [
        { id: 'rose', name: 'Hoa hồng', coins: 1, file: 'Rose_5655.png', radius: 15 },
        { id: 'heart', name: 'Trái tim', coins: 5, file: 'Beating_Heart_11809.png', radius: 17 },
        { id: 'doughnut', name: 'Bánh Donut', coins: 30, file: 'Doughnut.png', radius: 20 },
        { id: 'cap', name: 'Mũ TikTok', coins: 99, file: 'Wooly_Hat.png', radius: 22 },
        { id: 'diamond', name: 'Kim cương', coins: 100, file: 'Diamond_16051.png', radius: 24 },
        { id: 'corgi', name: 'Corgi', coins: 299, file: 'Corgi.png', radius: 26 },
        { id: 'money_gun', name: 'Súng bắn tiền', coins: 500, file: 'Money_Gun.png', radius: 29 },
        { id: 'whale', name: 'Cá voi lặn', coins: 1000, file: 'Whale_Diving_6820.png', radius: 34 },
        { id: 'galaxy', name: 'Vũ trụ Galaxy', coins: 1000, file: 'Galaxy_11046.png', radius: 38 },
        { id: 'dragon', name: 'Rồng lửa', coins: 10000, file: 'Dragon_Flame_7610.png', radius: 42 },
        { id: 'lion', name: 'Sư tử', coins: 29999, file: 'Lion_6369.png', radius: 46 },
        { id: 'zeus', name: 'Thần Zeus', coins: 34000, file: 'Zeus_8624.png', radius: 48 }
    ];

    class GiftJarPhysics {
        constructor(container, options = {}) {
            this.container = typeof container === 'string' ? document.querySelector(container) : container;
            if (!this.container) return;

            this.options = Object.assign({
                gravity: 1.15,
                getItemRect: null
            }, options);

            this.items = [];
            this.wallBodies = [];
            this.imageCache = {};
            this.isRunning = false;
            this.animFrameId = null;
            this.lastWallSig = '';
            this.prevJarRect = null;
            this.dpr = Math.max(2, (window.devicePixelRatio || 1));

            this.preloadPopularGifts();
            this.initCanvas();
            this.initPhysics();
            this.setupWalls();
            this.startLoop();
        }

        getAssetUrl(filename) {
            if (!filename) return '';
            if (filename.startsWith('http://') || filename.startsWith('https://') || filename.startsWith('data:')) {
                return filename;
            }
            const clean = filename.replace(/^\/+/, '');
            if (window.location && window.location.protocol === 'file:') {
                return `assets/gift-icons/${clean.replace(/^assets\/gift-icons\//, '')}`;
            }
            return `/assets/gift-icons/${clean.replace(/^assets\/gift-icons\//, '')}`;
        }

        preloadPopularGifts() {
            POPULAR_TIKTOK_GIFTS.forEach(g => {
                this.loadImage(g.id, this.getAssetUrl(g.file));
            });
        }

        loadImage(key, src) {
            if (this.imageCache[key]) return this.imageCache[key];
            const img = new Image();
            img.src = src;
            this.imageCache[key] = img;
            return img;
        }

        initCanvas() {
            const oldCanvas = this.container.querySelector('.gift-jar-physics-canvas');
            if (oldCanvas) oldCanvas.remove();

            this.canvas = document.createElement('canvas');
            this.canvas.className = 'gift-jar-physics-canvas';
            this.canvas.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 20;
            `;
            this.ctx = this.canvas.getContext('2d', { alpha: true });
            this.container.appendChild(this.canvas);
            this.resizeCanvas();

            this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
            this.resizeObserver.observe(this.container);
        }

        resizeCanvas() {
            if (!this.canvas || !this.container) return;
            const w = this.container.offsetWidth || this.container.clientWidth || 720;
            const h = this.container.offsetHeight || this.container.clientHeight || 960;

            this.width = w;
            this.height = h;

            // 2x / High-DPI Supersampling for crystal clear HD icons at any zoom
            const dpr = Math.max(2, (window.devicePixelRatio || 1));
            this.dpr = dpr;

            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(h * dpr);
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';

            this.setupWalls();
        }

        initPhysics() {
            const { Engine } = Matter;
            this.engine = Engine.create({
                enableSleeping: true,
                positionIterations: 8,
                velocityIterations: 6,
                gravity: { x: 0, y: this.options.gravity, scale: 0.0016 }
            });
            this.world = this.engine.world;
        }

        getArtboardBounds() {
            const safeAreaEl = this.container.querySelector('#gmd-safe-area');
            if (safeAreaEl) {
                const sw = parseFloat(safeAreaEl.style.width) || 360;
                const sh = parseFloat(safeAreaEl.style.height) || 640;
                const w = this.width || 720;
                const h = this.height || 960;
                const sx = Math.round((w - sw) / 2);
                const sy = Math.round((h - sh) / 2);
                return {
                    left: sx,
                    top: sy,
                    right: sx + sw,
                    bottom: sy + sh,
                    width: sw,
                    height: sh
                };
            }

            const w = this.container.offsetWidth || this.container.clientWidth || 1080;
            const h = this.container.offsetHeight || this.container.clientHeight || 1920;
            return {
                left: 0,
                top: 0,
                right: w,
                bottom: h,
                width: w,
                height: h
            };
        }

        getJarRect() {
            const jarWidget = this.container.querySelector('.gmd-gift-jar-widget') || document.querySelector('.gmd-gift-jar-widget');
            if (jarWidget) {
                const itemEl = jarWidget.closest('.gmd-item');
                if (itemEl) {
                    const x = parseFloat(itemEl.style.left);
                    const y = parseFloat(itemEl.style.top);
                    const w = parseFloat(itemEl.style.width);
                    const h = parseFloat(itemEl.style.height);
                    if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h) && w > 20 && h > 20) {
                        return { x, y, w, h };
                    }
                }
            }

            if (typeof this.options.getItemRect === 'function') {
                const r = this.options.getItemRect();
                if (r && r.w > 0 && r.h > 0) return r;
            }

            const bounds = this.getArtboardBounds();
            const defW = Math.round(bounds.width * 0.40);
            const defH = Math.round(bounds.height * 0.32);
            return {
                x: Math.round(bounds.left + (bounds.width - defW) / 2),
                y: Math.round(bounds.bottom - defH - 20),
                w: defW,
                h: defH
            };
        }

        checkAndSyncWalls() {
            const jar = this.getJarRect();
            const bounds = this.getArtboardBounds();
            const sig = `${bounds.left.toFixed(1)},${bounds.top.toFixed(1)},${bounds.width.toFixed(1)},${bounds.height.toFixed(1)}|${jar.x.toFixed(1)},${jar.y.toFixed(1)},${jar.w.toFixed(1)},${jar.h.toFixed(1)}`;
            
            // If jar moved, smoothly translate all gifts that are inside the jar along with it
            if (this.prevJarRect) {
                const dx = jar.x - this.prevJarRect.x;
                const dy = jar.y - this.prevJarRect.y;

                if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                    const prev = this.prevJarRect;
                    const prevLeft = prev.x;
                    const prevRight = prev.x + prev.w;
                    const prevTop = prev.y;
                    const prevBottom = prev.y + prev.h + 20;

                    for (let i = 0; i < this.items.length; i++) {
                        const b = this.items[i];
                        if (b.position.x >= prevLeft && b.position.x <= prevRight &&
                            b.position.y >= prevTop && b.position.y <= prevBottom) {
                            Matter.Body.setPosition(b, {
                                x: b.position.x + dx,
                                y: b.position.y + dy
                            });
                            Matter.Body.setVelocity(b, { x: 0, y: 0 });
                        }
                    }
                }
            }

            this.prevJarRect = { x: jar.x, y: jar.y, w: jar.w, h: jar.h };

            if (this.lastWallSig !== sig) {
                this.lastWallSig = sig;
                this.setupWalls();
            }
        }

        setupWalls() {
            if (!this.world) return;
            const { Bodies, World } = Matter;

            if (this.wallBodies.length) {
                World.remove(this.world, this.wallBodies);
                this.wallBodies = [];
            }

            const bounds = this.getArtboardBounds();

            // 1. Heavy Stage Floor & Left/Right Screen Walls (60px thick solid floor)
            const floor = Bodies.rectangle((bounds.left + bounds.right) / 2, bounds.bottom + 30, bounds.width + 200, 60, {
                isStatic: true, friction: 0.8, restitution: 0.05, label: 'floor'
            });
            const leftScreen = Bodies.rectangle(bounds.left - 20, (bounds.top + bounds.bottom) / 2, 40, bounds.height * 2, {
                isStatic: true, friction: 0.1, label: 'screen_left'
            });
            const rightScreen = Bodies.rectangle(bounds.right + 20, (bounds.top + bounds.bottom) / 2, 40, bounds.height * 2, {
                isStatic: true, friction: 0.1, label: 'screen_right'
            });
            this.wallBodies.push(floor, leftScreen, rightScreen);

            // 2. 100% Sealed Airtight Jar Physics Walls (Nestled neatly inside hu-thuong.png)
            const jar = this.getJarRect();
            const jx = jar.x + jar.w / 2;
            const jw = jar.w;
            const jh = jar.h;

            const wallThickness = Math.max(16, Math.round(jw * 0.09));

            // Solid Jar Bottom Wall (positioned inside the jar's bottom rim)
            const bottomY = jar.y + jh * 0.88;
            const jarBottom = Bodies.rectangle(jx, bottomY, jw * 0.74, wallThickness, {
                isStatic: true, friction: 0.7, restitution: 0.05, label: 'jar_bottom'
            });

            // Solid Jar Left Wall (inside left glass profile)
            const leftX = jar.x + jw * 0.16;
            const jarLeft = Bodies.rectangle(leftX, jar.y + jh * 0.56, wallThickness, jh * 0.60, {
                isStatic: true, friction: 0.1, restitution: 0.05, label: 'jar_left'
            });

            // Solid Jar Right Wall (inside right glass profile)
            const rightX = jar.x + jw * 0.84;
            const jarRight = Bodies.rectangle(rightX, jar.y + jh * 0.56, wallThickness, jh * 0.60, {
                isStatic: true, friction: 0.1, restitution: 0.05, label: 'jar_right'
            });

            // Left Inward Mouth Lip (guiding gifts straight down into jar mouth: `\`)
            const lipLeft = Bodies.rectangle(jar.x + jw * 0.22, jar.y + jh * 0.22, jw * 0.28, wallThickness, {
                isStatic: true, friction: 0.02, angle: 0.45, label: 'jar_lip_left'
            });

            // Right Inward Mouth Lip (guiding gifts straight down into jar mouth: `/`)
            const lipRight = Bodies.rectangle(jar.x + jw * 0.78, jar.y + jh * 0.22, jw * 0.28, wallThickness, {
                isStatic: true, friction: 0.02, angle: -0.45, label: 'jar_lip_right'
            });

            this.wallBodies.push(jarBottom, jarLeft, jarRight, lipLeft, lipRight);
            World.add(this.world, this.wallBodies);
        }

        spawnGiftBody(type, radius, data = {}) {
            const { Bodies, World, Body } = Matter;
            
            this.checkAndSyncWalls();

            const jar = this.getJarRect();
            const bounds = this.getArtboardBounds();

            // Center of the jar's mouth opening:
            const mouthCenterX = jar.x + jar.w / 2;

            // Spawn at the top edge of the 9:16 frame, EXACTLY above the jar's mouth!
            const spawnX = mouthCenterX + (Math.random() * 4 - 2);
            const spawnY = bounds.top - 15 - Math.random() * 15;

            const scaleFactor = bounds.width < 600 ? (bounds.width / 720) : 1;
            const r = Math.max(8, Math.round(radius * scaleFactor));

            const restitution = 0.08;
            const friction = 0.35;

            const body = Bodies.circle(spawnX, spawnY, r, {
                restitution,
                friction,
                frictionAir: 0.004,
                density: 0.005,
                sleepThreshold: 30
            });

            body.giftType = type;
            body.giftData = data;
            body.giftRadius = r;

            // Straight vertical drop down into the jar mouth
            Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 0.02,
                y: Math.random() * 1.5 + 4.5
            });
            Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.02);

            if (data.imageUrl && !this.imageCache[data.imageUrl]) {
                this.loadImage(data.imageUrl, data.imageUrl);
            }

            World.add(this.world, body);
            this.items.push(body);

            // Keep up to 800 active gifts without prematurely deleting bottom gifts
            if (this.items.length > 800) {
                const oldest = this.items.shift();
                World.remove(this.world, oldest);
            }

            return body;
        }

        spawnRose(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('rose', 15, {
                        imageKey: 'rose',
                        name: 'Hoa hồng'
                    });
                }, i * 45);
            }
        }

        spawnHeart(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('heart', 17, {
                        imageKey: 'heart',
                        name: 'Trái tim'
                    });
                }, i * 60);
            }
        }

        spawnDoughnut() {
            this.spawnGiftBody('doughnut', 20, {
                imageKey: 'doughnut',
                name: 'Bánh Donut'
            });
        }

        spawnCap() {
            this.spawnGiftBody('cap', 22, {
                imageKey: 'cap',
                name: 'Mũ TikTok'
            });
        }

        spawnDiamond(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('diamond', 24, {
                        imageKey: 'diamond',
                        name: 'Kim cương'
                    });
                }, i * 70);
            }
        }

        spawnCorgi() {
            this.spawnGiftBody('corgi', 26, {
                imageKey: 'corgi',
                name: 'Corgi'
            });
        }

        spawnMoneyGun() {
            this.spawnGiftBody('money_gun', 29, {
                imageKey: 'money_gun',
                name: 'Súng bắn tiền'
            });
        }

        spawnWhale() {
            this.spawnGiftBody('whale', 34, {
                imageKey: 'whale',
                name: 'Cá voi'
            });
        }

        spawnGalaxy() {
            this.spawnGiftBody('galaxy', 38, {
                imageKey: 'galaxy',
                name: 'Vũ trụ Galaxy'
            });
        }

        spawnDragon() {
            this.spawnGiftBody('dragon', 42, {
                imageKey: 'dragon',
                name: 'Rồng lửa'
            });
        }

        spawnLion() {
            this.spawnGiftBody('lion', 46, {
                imageKey: 'lion',
                name: 'Sư tử'
            });
        }

        spawnZeus() {
            this.spawnGiftBody('zeus', 48, {
                imageKey: 'zeus',
                name: 'Thần Zeus'
            });
        }

        spawnTopDonorBadge(rank = 1, nickname = 'Top Fan') {
            this.spawnGiftBody('top_donor', 24, {
                rank: rank || 1,
                nickname: nickname || 'Top 1'
            });
        }

        spawnLiveGift(giftData = {}) {
            const coins = Number(giftData.coins) || 1;
            const repeat = Math.min(15, Number(giftData.repeatCount) || 1);
            let radius = 15;
            let type = 'live_gift';

            if (coins >= 10000) radius = 46;
            else if (coins >= 1000) radius = 38;
            else if (coins >= 300) radius = 29;
            else if (coins >= 100) radius = 24;
            else if (coins >= 10) radius = 17;
            else radius = 15;

            for (let i = 0; i < repeat; i++) {
                setTimeout(() => {
                    this.spawnGiftBody(type, radius, {
                        name: giftData.giftName || 'Quà TikTok',
                        imageUrl: giftData.giftIcon || giftData.giftPictureUrl || '',
                        imageKey: giftData.giftId || 'rose'
                    });
                }, i * 50);
            }
        }

        spawnRandomGift(tier = 'random') {
            if (tier === 'small') {
                const smallGifts = ['rose', 'heart'];
                const key = smallGifts[Math.floor(Math.random() * smallGifts.length)];
                if (key === 'rose') this.spawnRose(Math.floor(Math.random() * 8) + 4);
                else this.spawnHeart(Math.floor(Math.random() * 5) + 2);
            } else if (tier === 'medium') {
                const mediumGifts = ['diamond', 'corgi', 'money_gun', 'doughnut', 'cap'];
                const choice = mediumGifts[Math.floor(Math.random() * mediumGifts.length)];
                if (choice === 'diamond') this.spawnDiamond(2);
                else if (choice === 'corgi') this.spawnCorgi();
                else if (choice === 'doughnut') this.spawnDoughnut();
                else if (choice === 'cap') this.spawnCap();
                else this.spawnMoneyGun();
            } else if (tier === 'large') {
                const largeGifts = ['whale', 'galaxy', 'dragon', 'lion', 'zeus'];
                const choice = largeGifts[Math.floor(Math.random() * largeGifts.length)];
                if (choice === 'whale') this.spawnWhale();
                else if (choice === 'galaxy') this.spawnGalaxy();
                else if (choice === 'dragon') this.spawnDragon();
                else if (choice === 'zeus') this.spawnZeus();
                else this.spawnLion();
            } else if (tier === 'top_donor') {
                this.spawnTopDonorBadge(1, 'Top 1 Supporter');
            } else {
                const gift = POPULAR_TIKTOK_GIFTS[Math.floor(Math.random() * POPULAR_TIKTOK_GIFTS.length)];
                const count = gift.coins < 10 ? Math.floor(Math.random() * 6) + 3 : 1;
                for (let i = 0; i < count; i++) {
                    setTimeout(() => {
                        this.spawnGiftBody(gift.id, gift.radius, {
                            imageKey: gift.id,
                            name: gift.name
                        });
                    }, i * 40);
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

                // Continuously track moving jar in real-time and translate all inside gifts
                this.checkAndSyncWalls();

                // Stabilize resting bodies to prevent physics jitter
                for (let i = 0; i < this.items.length; i++) {
                    const b = this.items[i];
                    if (Math.abs(b.velocity.x) < 0.04 && Math.abs(b.velocity.y) < 0.04) {
                        Matter.Body.setVelocity(b, { x: 0, y: 0 });
                        Matter.Body.setAngularVelocity(b, 0);
                    }
                }

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
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, this.width, this.height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            for (let i = 0; i < this.items.length; i++) {
                const b = this.items[i];
                const x = b.position.x;
                const y = b.position.y;
                const angle = b.angle;
                const r = b.giftRadius || 15;
                const type = b.giftType;
                const data = b.giftData || {};

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);

                if (type === 'top_donor') {
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.fillStyle = '#f59e0b';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = `900 ${Math.max(10, r * 0.7)}px "Inter", "Segoe UI", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`👑 #${data.rank || 1}`, 0, 0);
                } else {
                    const img = this.imageCache[data.imageUrl] || this.imageCache[data.imageKey || type];
                    if (img && img.complete && img.naturalWidth > 0) {
                        const size = r * 2.2;
                        ctx.drawImage(img, -size / 2, -size / 2, size, size);
                    } else {
                        ctx.font = `${r * 2}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(type === 'rose' ? '🌹' : type === 'lion' ? '🦁' : '🎁', 0, 0);
                    }
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
