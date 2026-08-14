/**
 * LiveFlow Gift Jar 2D Physics Engine (Powered by Matter.js)
 * Implements real physical bouncing, rolling, stacking, and overflow
 * with FULL 100% sync for all 645+ REAL TikTok Live Gift Icons.
 */
(function(window) {
    'use strict';

    const POPULAR_TIKTOK_GIFTS = [
        { id: 'rose', name: 'Hoa hồng', coins: 1, file: 'Rose_5655.png', radius: 14 },
        { id: 'heart', name: 'Trái tim', coins: 5, file: 'Beating_Heart_11809.png', radius: 16 },
        { id: 'doughnut', name: 'Bánh Donut', coins: 30, file: 'Doughnut.png', radius: 19 },
        { id: 'cap', name: 'Mũ TikTok', coins: 99, file: 'Wooly_Hat.png', radius: 21 },
        { id: 'diamond', name: 'Kim cương', coins: 100, file: 'Diamond_16051.png', radius: 23 },
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
                gravity: 1.0,
                getItemRect: null
            }, options);

            this.items = [];
            this.wallBodies = [];
            this.imageCache = {};
            this.isRunning = false;
            this.animFrameId = null;

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
                z-index: 15;
            `;
            this.ctx = this.canvas.getContext('2d');
            this.container.appendChild(this.canvas);
            this.resizeCanvas();

            this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
            this.resizeObserver.observe(this.container);
        }

        resizeCanvas() {
            if (!this.canvas || !this.container) return;
            const w = this.container.offsetWidth || this.container.clientWidth || 1080;
            const h = this.container.offsetHeight || this.container.clientHeight || 1920;

            this.width = w;
            this.height = h;

            this.canvas.width = w;
            this.canvas.height = h;
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';

            this.setupWalls();
        }

        initPhysics() {
            const { Engine } = Matter;
            this.engine = Engine.create({
                enableSleeping: false,
                gravity: { x: 0, y: this.options.gravity, scale: 0.0015 }
            });
            this.world = this.engine.world;
        }

        getArtboardBounds() {
            // Check if inside designer stage with #gmd-safe-area
            const safeAreaEl = this.container.querySelector('#gmd-safe-area');
            if (safeAreaEl) {
                const sx = parseFloat(safeAreaEl.style.left) || 180;
                const sy = parseFloat(safeAreaEl.style.top) || 160;
                const sw = parseFloat(safeAreaEl.style.width) || 360;
                const sh = parseFloat(safeAreaEl.style.height) || 640;
                return {
                    left: sx,
                    top: sy,
                    right: sx + sw,
                    bottom: sy + sh,
                    width: sw,
                    height: sh
                };
            }

            // In OBS Overlay
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
            if (typeof this.options.getItemRect === 'function') {
                const r = this.options.getItemRect();
                if (r && r.w > 0 && r.h > 0) return r;
            }

            const jarWidget = this.container.querySelector('.gmd-gift-jar-widget') || document.querySelector('.gmd-gift-jar-widget');
            if (jarWidget) {
                const itemEl = jarWidget.closest('.gmd-item');
                if (itemEl) {
                    return {
                        x: parseFloat(itemEl.style.left) || 0,
                        y: parseFloat(itemEl.style.top) || 0,
                        w: parseFloat(itemEl.style.width) || 160,
                        h: parseFloat(itemEl.style.height) || 200
                    };
                }
            }

            const bounds = this.getArtboardBounds();
            const defW = bounds.width * 0.45;
            const defH = bounds.height * 0.35;
            return {
                x: bounds.left + (bounds.width - defW) / 2,
                y: bounds.bottom - defH - 30,
                w: defW,
                h: defH
            };
        }

        setupWalls() {
            if (!this.world) return;
            const { Bodies, World } = Matter;

            if (this.wallBodies.length) {
                World.remove(this.world, this.wallBodies);
                this.wallBodies = [];
            }

            const bounds = this.getArtboardBounds();

            // 1. Stage Floor & Left/Right Screen Walls STRICTLY at the 9:16 Artboard Boundaries
            const floor = Bodies.rectangle((bounds.left + bounds.right) / 2, bounds.bottom + 15, bounds.width + 40, 30, {
                isStatic: true, friction: 0.6, label: 'floor'
            });
            const leftScreen = Bodies.rectangle(bounds.left - 15, (bounds.top + bounds.bottom) / 2, 30, bounds.height * 2, {
                isStatic: true, friction: 0.1, label: 'screen_left'
            });
            const rightScreen = Bodies.rectangle(bounds.right + 15, (bounds.top + bounds.bottom) / 2, 30, bounds.height * 2, {
                isStatic: true, friction: 0.1, label: 'screen_right'
            });
            this.wallBodies.push(floor, leftScreen, rightScreen);

            // 2. Exact Physics Walls of the Glass Jar (matching the DOM element position)
            const jar = this.getJarRect();
            const jx = jar.x + jar.w / 2;
            const jy = jar.y + jar.h / 2;
            const jw = jar.w;
            const jh = jar.h;

            this.jarCenter = { 
                x: jx, 
                y: jy, 
                w: jw, 
                h: jh, 
                topY: jar.y,
                mouthY: jar.y + jh * 0.18
            };

            const wallThickness = Math.max(14, Math.round(jw * 0.08));

            // Jar Bottom Wall
            const bottomY = jar.y + jh * 0.88;
            const jarBottom = Bodies.rectangle(jx, bottomY, jw * 0.68, wallThickness, {
                isStatic: true, friction: 0.4, restitution: 0.2, label: 'jar_bottom'
            });

            // Jar Left Wall
            const leftX = jar.x + jw * 0.16;
            const jarLeft = Bodies.rectangle(leftX, jar.y + jh * 0.55, wallThickness, jh * 0.60, {
                isStatic: true, friction: 0.15, restitution: 0.2, label: 'jar_left'
            });

            // Jar Right Wall
            const rightX = jar.x + jw * 0.84;
            const jarRight = Bodies.rectangle(rightX, jar.y + jh * 0.55, wallThickness, jh * 0.60, {
                isStatic: true, friction: 0.15, restitution: 0.2, label: 'jar_right'
            });

            // Left Funnel Lip
            const lipLeft = Bodies.rectangle(jar.x + jw * 0.24, jar.y + jh * 0.20, jw * 0.26, wallThickness, {
                isStatic: true, friction: 0.05, angle: -0.55, label: 'jar_lip_left'
            });

            // Right Funnel Lip
            const lipRight = Bodies.rectangle(jar.x + jw * 0.76, jar.y + jh * 0.20, jw * 0.26, wallThickness, {
                isStatic: true, friction: 0.05, angle: 0.55, label: 'jar_lip_right'
            });

            this.wallBodies.push(jarBottom, jarLeft, jarRight, lipLeft, lipRight);
            World.add(this.world, this.wallBodies);
        }

        spawnGiftBody(type, radius, data = {}) {
            const { Bodies, World, Body } = Matter;
            
            this.setupWalls();

            const jar = this.jarCenter || { x: 360, topY: 300 };
            const bounds = this.getArtboardBounds();

            // Spawn directly above the jar opening (inside the 9:16 safe frame)
            const spawnX = jar.x + (Math.random() * 12 - 6);
            const spawnY = Math.max(bounds.top + 10, jar.topY - 60 - Math.random() * 20);

            // Scale radius proportionally to the artboard width
            const scaleFactor = bounds.width < 600 ? (bounds.width / 720) : 1;
            const r = Math.max(8, Math.round(radius * scaleFactor));

            const restitution = type === 'rose' ? 0.2 : 0.28;
            const friction = type === 'rose' ? 0.2 : 0.12;

            const body = Bodies.circle(spawnX, spawnY, r, {
                restitution,
                friction,
                frictionAir: 0.005,
                density: 0.002
            });

            body.giftType = type;
            body.giftData = data;
            body.giftRadius = r;

            Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 0.2,
                y: Math.random() * 1.5 + 2.5
            });
            Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.04);

            if (data.imageUrl && !this.imageCache[data.imageUrl]) {
                this.loadImage(data.imageUrl, data.imageUrl);
            }

            World.add(this.world, body);
            this.items.push(body);

            if (this.items.length > 320) {
                const oldest = this.items.shift();
                World.remove(this.world, oldest);
            }

            return body;
        }

        spawnRose(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('rose', 14, {
                        imageKey: 'rose',
                        name: 'Hoa hồng'
                    });
                }, i * 45);
            }
        }

        spawnHeart(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('heart', 16, {
                        imageKey: 'heart',
                        name: 'Trái tim'
                    });
                }, i * 60);
            }
        }

        spawnDoughnut() {
            this.spawnGiftBody('doughnut', 19, {
                imageKey: 'doughnut',
                name: 'Bánh Donut'
            });
        }

        spawnCap() {
            this.spawnGiftBody('cap', 21, {
                imageKey: 'cap',
                name: 'Mũ TikTok'
            });
        }

        spawnDiamond(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('diamond', 23, {
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
            let radius = 14;
            let type = 'live_gift';

            if (coins >= 10000) radius = 46;
            else if (coins >= 1000) radius = 38;
            else if (coins >= 300) radius = 29;
            else if (coins >= 100) radius = 23;
            else if (coins >= 10) radius = 16;
            else radius = 14;

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

                Matter.Engine.update(this.engine, delta);
                this.render();

                this.animFrameId = requestAnimationFrame(loop);
            };

            this.animFrameId = requestAnimationFrame(loop);
        }

        render() {
            if (!this.ctx || !this.canvas) return;
            const ctx = this.ctx;

            ctx.clearRect(0, 0, this.width, this.height);

            for (let i = 0; i < this.items.length; i++) {
                const b = this.items[i];
                const { x, y } = b.position;
                const angle = b.angle;
                const r = b.giftRadius || 14;
                const type = b.giftType;
                const data = b.giftData || {};

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);

                if (type === 'top_donor') {
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.fillStyle = '#f59e0b';
                    ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
                    ctx.shadowBlur = 8;
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = `900 ${Math.max(8, r * 0.7)}px "Inter", "Segoe UI", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`👑 #${data.rank || 1}`, 0, 0);
                } else {
                    const img = this.imageCache[data.imageUrl] || this.imageCache[data.imageKey || type];
                    if (img && img.complete && img.naturalWidth > 0) {
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 5;
                        ctx.shadowOffsetY = 2;
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
