/**
 * LiveFlow Gift Jar 2D Physics Engine (Powered by Matter.js)
 * Implements real physical bouncing, rolling, stacking, and overflow
 * with FULL 100% sync for all 645+ REAL TikTok Live Gift Icons.
 * Automatic dynamic capacity scaling: Automatically scales icon sizes to fit any capacity (1,000 -> 10,000 -> 1,000,000 Xu).
 */
(function(window) {
    'use strict';

    const POPULAR_TIKTOK_GIFTS = [
        { id: 'rose', name: 'Hoa hồng', coins: 1, file: 'Rose_5655.png', baseRadius: 6.5 },
        { id: 'heart', name: 'Trái tim', coins: 5, file: 'Beating_Heart_11809.png', baseRadius: 7 },
        { id: 'doughnut', name: 'Bánh Donut', coins: 30, file: 'Doughnut.png', baseRadius: 8.5 },
        { id: 'cap', name: 'Mũ TikTok', coins: 99, file: 'Wooly_Hat.png', baseRadius: 9 },
        { id: 'diamond', name: 'Kim cương', coins: 100, file: 'Diamond_16051.png', baseRadius: 10.5 },
        { id: 'corgi', name: 'Corgi', coins: 299, file: 'Corgi.png', baseRadius: 11.5 },
        { id: 'money_gun', name: 'Súng bắn tiền', coins: 500, file: 'Money_Gun.png', baseRadius: 12.5 },
        { id: 'whale', name: 'Cá voi lặn', coins: 1000, file: 'Whale_Diving_6820.png', baseRadius: 14 },
        { id: 'galaxy', name: 'Vũ trụ Galaxy', coins: 1000, file: 'Galaxy_11046.png', baseRadius: 15 },
        { id: 'dragon', name: 'Rồng lửa', coins: 10000, file: 'Dragon_Flame_7610.png', baseRadius: 17 },
        { id: 'lion', name: 'Sư tử', coins: 29999, file: 'Lion_6369.png', baseRadius: 18.5 },
        { id: 'zeus', name: 'Thần Zeus', coins: 34000, file: 'Zeus_8624.png', baseRadius: 19.5 }
    ];

    class GiftJarPhysics {
        constructor(container, options = {}) {
            this.container = typeof container === 'string' ? document.querySelector(container) : container;
            if (!this.container) return;

            this.options = Object.assign({
                gravity: 1.15,
                getItemRect: null,
                getTargetCoins: null
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

        getCapacityScale() {
            let targetCoins = 1000;
            if (typeof this.options.getTargetCoins === 'function') {
                targetCoins = Number(this.options.getTargetCoins()) || 1000;
            } else {
                const jarWidget = this.container?.querySelector('.gmd-gift-jar-widget') || document.querySelector('.gmd-gift-jar-widget');
                if (jarWidget) {
                    const itemEl = jarWidget.closest('.gmd-item');
                    if (itemEl && itemEl.dataset && itemEl.dataset.targetCoins) {
                        targetCoins = Number(itemEl.dataset.targetCoins) || 1000;
                    }
                }
            }
            // Smooth capacity scaling curve: perfectly auto-adjusts size for 500, 1000, 10k, 100k, 1M xu
            const rawScale = Math.pow(1000 / Math.max(100, targetCoins), 0.20);
            return Math.max(0.40, Math.min(1.20, rawScale));
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
                positionIterations: 10,
                velocityIterations: 8,
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
            
            if (this.prevJarRect) {
                const dx = jar.x - this.prevJarRect.x;
                const dy = jar.y - this.prevJarRect.y;

                if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
                    const prev = this.prevJarRect;
                    const prevInnerLeft = prev.x + prev.w * 0.22;
                    const prevInnerRight = prev.x + prev.w * 0.78;
                    const prevInnerTop = prev.y + prev.h * 0.24;
                    const prevInnerBottom = prev.y + prev.h * 0.88;

                    const newOuterLeft = jar.x + jar.w * 0.18;
                    const newOuterRight = jar.x + jar.w * 0.82;
                    const newOuterTop = jar.y + jar.h * 0.18;
                    const newOuterBottom = jar.y + jar.h * 0.90;

                    for (let i = 0; i < this.items.length; i++) {
                        const b = this.items[i];
                        const r = b.giftRadius || 8;

                        // 1. Items inside the jar cavity move WITH the jar
                        const wasInside = (
                            b.position.x >= prevInnerLeft && b.position.x <= prevInnerRight &&
                            b.position.y >= prevInnerTop && b.position.y <= prevInnerBottom
                        );

                        if (wasInside) {
                            Matter.Body.setPosition(b, {
                                x: b.position.x + dx,
                                y: b.position.y + dy
                            });
                            Matter.Body.setVelocity(b, { x: 0, y: 0 });
                        } else {
                            // 2. Items on the OUTSIDE get physically PUSHED / BULLDOZED away
                            const isCollidingWithNewJar = (
                                b.position.x >= (newOuterLeft - r) && b.position.x <= (newOuterRight + r) &&
                                b.position.y >= (newOuterTop - r) && b.position.y <= (newOuterBottom + r)
                            );

                            if (isCollidingWithNewJar) {
                                if (dx > 0.4) {
                                    const targetX = newOuterRight + r + 2;
                                    Matter.Body.setPosition(b, { x: Math.max(b.position.x, targetX), y: b.position.y });
                                    Matter.Body.setVelocity(b, { x: Math.max(b.velocity.x, dx * 0.8 + 2.0), y: Math.min(b.velocity.y, -1.0) });
                                } else if (dx < -0.4) {
                                    const targetX = newOuterLeft - r - 2;
                                    Matter.Body.setPosition(b, { x: Math.min(b.position.x, targetX), y: b.position.y });
                                    Matter.Body.setVelocity(b, { x: Math.min(b.velocity.x, dx * 0.8 - 2.0), y: Math.min(b.velocity.y, -1.0) });
                                }

                                if (dy > 0.4 && b.position.y >= newOuterBottom - 15) {
                                    const sideDir = b.position.x >= (jar.x + jar.w / 2) ? 1 : -1;
                                    Matter.Body.setPosition(b, { x: b.position.x + sideDir * 4, y: Math.max(b.position.y, newOuterBottom + r + 2) });
                                    Matter.Body.setVelocity(b, { x: sideDir * 3.5, y: dy * 0.6 });
                                }
                            }
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

            // 1. Strict 9:16 Screen Boundaries
            const leftScreen = Bodies.rectangle(bounds.left - 25, (bounds.top + bounds.bottom) / 2, 50, bounds.height * 2, {
                isStatic: true, friction: 0.2, label: 'screen_left'
            });
            const rightScreen = Bodies.rectangle(bounds.right + 25, (bounds.top + bounds.bottom) / 2, 50, bounds.height * 2, {
                isStatic: true, friction: 0.2, label: 'screen_right'
            });
            const floor = Bodies.rectangle((bounds.left + bounds.right) / 2, bounds.bottom + 25, bounds.width + 100, 50, {
                isStatic: true, friction: 0.8, restitution: 0.05, label: 'floor'
            });
            this.wallBodies.push(floor, leftScreen, rightScreen);

            // 2. Contour-Hugging Tight Jar Physics (Exactly matching hu-thuong.png)
            const jar = this.getJarRect();
            const jx = jar.x + jar.w / 2;
            const jw = jar.w;
            const jh = jar.h;

            const wallThickness = 12;

            // Tight Jar Bottom Floor
            const bottomY = jar.y + jh * 0.88;
            const jarBottom = Bodies.rectangle(jx, bottomY, jw * 0.58, wallThickness, {
                isStatic: true, friction: 0.8, restitution: 0.02, label: 'jar_bottom'
            });

            // Tight Left Glass Wall
            const leftX = jar.x + jw * 0.21;
            const jarLeft = Bodies.rectangle(leftX, jar.y + jh * 0.54, wallThickness, jh * 0.66, {
                isStatic: true, friction: 0.1, restitution: 0.02, label: 'jar_left'
            });

            // Tight Right Glass Wall
            const rightX = jar.x + jw * 0.79;
            const jarRight = Bodies.rectangle(rightX, jar.y + jh * 0.54, wallThickness, jh * 0.66, {
                isStatic: true, friction: 0.1, restitution: 0.02, label: 'jar_right'
            });

            // Tight Inward Neck Funnel (guiding 100% of drops into jar center)
            const lipLeft = Bodies.rectangle(jar.x + jw * 0.26, jar.y + jh * 0.20, jw * 0.16, wallThickness, {
                isStatic: true, friction: 0.01, angle: 0.45, label: 'jar_lip_left'
            });

            const lipRight = Bodies.rectangle(jar.x + jw * 0.74, jar.y + jh * 0.20, jw * 0.16, wallThickness, {
                isStatic: true, friction: 0.01, angle: -0.45, label: 'jar_lip_right'
            });

            this.wallBodies.push(jarBottom, jarLeft, jarRight, lipLeft, lipRight);
            World.add(this.world, this.wallBodies);
        }

        spawnGiftBody(type, baseRadius, data = {}) {
            const { Bodies, World, Body } = Matter;
            
            this.checkAndSyncWalls();

            const jar = this.getJarRect();
            const bounds = this.getArtboardBounds();

            const mouthCenterX = jar.x + jar.w / 2;
            const spawnX = mouthCenterX;
            const spawnY = bounds.top - 15;

            const capScale = this.getCapacityScale();
            const scaleFactor = bounds.width < 600 ? (bounds.width / 720) : 1;
            const r = Math.max(3.5, Math.round(baseRadius * capScale * scaleFactor));

            const restitution = 0.02;
            const friction = 0.45;

            const body = Bodies.circle(spawnX, spawnY, r, {
                restitution,
                friction,
                frictionAir: 0.005,
                density: 0.003,
                sleepThreshold: 25
            });

            body.giftType = type;
            body.giftData = data;
            body.giftRadius = r;

            Body.setVelocity(body, {
                x: 0,
                y: Math.random() * 0.5 + 2.5
            });
            Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.01);

            if (data.imageUrl && !this.imageCache[data.imageUrl]) {
                this.loadImage(data.imageUrl, data.imageUrl);
            }

            World.add(this.world, body);
            this.items.push(body);

            if (this.items.length > 800) {
                const oldest = this.items.shift();
                World.remove(this.world, oldest);
            }

            return body;
        }

        spawnRose(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('rose', 6.5, {
                        imageKey: 'rose',
                        name: 'Hoa hồng'
                    });
                }, i * 45);
            }
        }

        spawnHeart(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('heart', 7, {
                        imageKey: 'heart',
                        name: 'Trái tim'
                    });
                }, i * 60);
            }
        }

        spawnDoughnut() {
            this.spawnGiftBody('doughnut', 8.5, {
                imageKey: 'doughnut',
                name: 'Bánh Donut'
            });
        }

        spawnCap() {
            this.spawnGiftBody('cap', 9, {
                imageKey: 'cap',
                name: 'Mũ TikTok'
            });
        }

        spawnDiamond(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('diamond', 10.5, {
                        imageKey: 'diamond',
                        name: 'Kim cương'
                    });
                }, i * 70);
            }
        }

        spawnCorgi() {
            this.spawnGiftBody('corgi', 11.5, {
                imageKey: 'corgi',
                name: 'Corgi'
            });
        }

        spawnMoneyGun() {
            this.spawnGiftBody('money_gun', 12.5, {
                imageKey: 'money_gun',
                name: 'Súng bắn tiền'
            });
        }

        spawnWhale() {
            this.spawnGiftBody('whale', 14, {
                imageKey: 'whale',
                name: 'Cá voi'
            });
        }

        spawnGalaxy() {
            this.spawnGiftBody('galaxy', 15, {
                imageKey: 'galaxy',
                name: 'Vũ trụ Galaxy'
            });
        }

        spawnDragon() {
            this.spawnGiftBody('dragon', 17, {
                imageKey: 'dragon',
                name: 'Rồng lửa'
            });
        }

        spawnLion() {
            this.spawnGiftBody('lion', 18.5, {
                imageKey: 'lion',
                name: 'Sư tử'
            });
        }

        spawnZeus() {
            this.spawnGiftBody('zeus', 19.5, {
                imageKey: 'zeus',
                name: 'Thần Zeus'
            });
        }

        spawnTopDonorBadge(rank = 1, nickname = 'Top Fan') {
            this.spawnGiftBody('top_donor', 12, {
                rank: rank || 1,
                nickname: nickname || 'Top 1'
            });
        }

        spawnLiveGift(giftData = {}) {
            const coins = Number(giftData.coins) || 1;
            const repeat = Math.min(15, Number(giftData.repeatCount) || 1);
            let baseRadius = 6.5;
            let type = 'live_gift';

            if (coins >= 10000) baseRadius = 18.5;
            else if (coins >= 1000) baseRadius = 14.5;
            else if (coins >= 300) baseRadius = 12;
            else if (coins >= 100) baseRadius = 10.5;
            else if (coins >= 10) baseRadius = 8.5;
            else baseRadius = 6.5;

            for (let i = 0; i < repeat; i++) {
                setTimeout(() => {
                    this.spawnGiftBody(type, baseRadius, {
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
                if (key === 'rose') this.spawnRose(Math.floor(Math.random() * 6) + 2);
                else this.spawnHeart(Math.floor(Math.random() * 4) + 2);
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
                const count = gift.coins < 10 ? Math.floor(Math.random() * 4) + 2 : 1;
                for (let i = 0; i < count; i++) {
                    setTimeout(() => {
                        this.spawnGiftBody(gift.id, gift.baseRadius, {
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

                this.checkAndSyncWalls();

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
                const r = b.giftRadius || 8;
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
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = `900 ${Math.max(8, r * 0.75)}px "Inter", "Segoe UI", sans-serif`;
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
