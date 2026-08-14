/**
 * LiveFlow Gift Jar 2D Physics Engine (Powered by Matter.js)
 * Implements real physical bouncing, rolling, stacking, and overflow
 * with FULL 100% sync for all 645+ REAL TikTok Live Gift Icons.
 */
(function(window) {
    'use strict';

    const POPULAR_TIKTOK_GIFTS = [
        { id: 'rose', name: 'Hoa hồng', coins: 1, file: 'Rose_5655.png', radius: 14 },
        { id: 'heart', name: 'Trái tim', coins: 5, file: 'Beating_Heart_11809.png', radius: 18 },
        { id: 'doughnut', name: 'Bánh Donut', coins: 30, file: 'Doughnut.png', radius: 22 },
        { id: 'cap', name: 'Mũ TikTok', coins: 99, file: 'Wooly_Hat.png', radius: 24 },
        { id: 'diamond', name: 'Kim cương', coins: 100, file: 'Diamond_16051.png', radius: 26 },
        { id: 'corgi', name: 'Corgi', coins: 299, file: 'Corgi.png', radius: 30 },
        { id: 'money_gun', name: 'Súng bắn tiền', coins: 500, file: 'Money_Gun.png', radius: 34 },
        { id: 'whale', name: 'Cá voi lặn', coins: 1000, file: 'Whale_Diving_6820.png', radius: 40 },
        { id: 'galaxy', name: 'Vũ trụ Galaxy', coins: 1000, file: 'Galaxy_11046.png', radius: 44 },
        { id: 'dragon', name: 'Rồng lửa', coins: 10000, file: 'Dragon_Flame_13338.png', radius: 48 },
        { id: 'lion', name: 'Sư tử', coins: 29999, file: 'Lion_6369.png', radius: 54 },
        { id: 'zeus', name: 'Thần Zeus', coins: 34000, file: 'Zeus_8624.png', radius: 56 }
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

        preloadPopularGifts() {
            POPULAR_TIKTOK_GIFTS.forEach(g => {
                this.loadImage(g.id, `/assets/gift-icons/${g.file}`);
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
            // Use stage offsetWidth / offsetHeight which is in logical stage coordinate space (e.g. 1080x1920)
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
                gravity: { x: 0, y: this.options.gravity, scale: 0.0012 }
            });
            this.world = this.engine.world;
        }

        getJarRect() {
            if (typeof this.options.getItemRect === 'function') {
                const r = this.options.getItemRect();
                if (r) return r;
            }

            const jarWidget = this.container.querySelector('.gmd-gift-jar-widget') || document.querySelector('.gmd-gift-jar-widget');
            if (jarWidget) {
                const itemEl = jarWidget.closest('.gmd-item');
                if (itemEl) {
                    return {
                        x: parseFloat(itemEl.style.left) || 0,
                        y: parseFloat(itemEl.style.top) || 0,
                        w: parseFloat(itemEl.style.width) || 480,
                        h: parseFloat(itemEl.style.height) || 600
                    };
                }
            }

            return {
                x: this.width * 0.25,
                y: this.height * 0.45,
                w: this.width * 0.5,
                h: this.height * 0.45
            };
        }

        setupWalls() {
            if (!this.world) return;
            const { Bodies, World } = Matter;

            if (this.wallBodies.length) {
                World.remove(this.world, this.wallBodies);
                this.wallBodies = [];
            }

            const w = this.width;
            const h = this.height;

            // Screen Artboard Floor & Side walls (confined to 9:16 stage frame)
            const floor = Bodies.rectangle(w / 2, h + 25, w * 2, 60, { isStatic: true, friction: 0.6, label: 'floor' });
            const leftScreen = Bodies.rectangle(-25, h / 2, 60, h * 2, { isStatic: true, friction: 0.1, label: 'screen_left' });
            const rightScreen = Bodies.rectangle(w + 25, h / 2, 60, h * 2, { isStatic: true, friction: 0.1, label: 'screen_right' });
            this.wallBodies.push(floor, leftScreen, rightScreen);

            // Compute Jar Physics Box in logical stage coordinates
            const jar = this.getJarRect();
            const jx = jar.x + jar.w / 2;
            const jy = jar.y + jar.h / 2;
            const jw = jar.w * 0.80;
            const jh = jar.h * 0.76;

            this.jarCenter = { x: jx, y: jy, w: jw, h: jh, topY: jar.y };

            const wallThickness = 20;
            const halfW = jw / 2;
            const halfH = jh / 2;

            // Jar Bottom Wall
            const jarBottom = Bodies.rectangle(jx, jy + halfH - 10, jw * 0.82, wallThickness, {
                isStatic: true, friction: 0.4, restitution: 0.2, label: 'jar_bottom'
            });

            // Jar Left Wall
            const jarLeft = Bodies.rectangle(jx - halfW + 10, jy + 15, wallThickness, jh * 0.75, {
                isStatic: true, friction: 0.15, restitution: 0.2, angle: 0.04, label: 'jar_left'
            });

            // Jar Right Wall
            const jarRight = Bodies.rectangle(jx + halfW - 10, jy + 15, wallThickness, jh * 0.75, {
                isStatic: true, friction: 0.15, restitution: 0.2, angle: -0.04, label: 'jar_right'
            });

            // Jar Left Funnel Lip (funnels gifts into jar)
            const jarLipLeft = Bodies.rectangle(jx - halfW * 0.68, jy - halfH + 26, jw * 0.35, wallThickness, {
                isStatic: true, friction: 0.1, angle: -0.38, label: 'jar_lip_left'
            });

            // Jar Right Funnel Lip (funnels gifts into jar)
            const jarLipRight = Bodies.rectangle(jx + halfW * 0.68, jy - halfH + 26, jw * 0.35, wallThickness, {
                isStatic: true, friction: 0.1, angle: 0.38, label: 'jar_lip_right'
            });

            this.wallBodies.push(jarBottom, jarLeft, jarRight, jarLipLeft, jarLipRight);
            World.add(this.world, this.wallBodies);
        }

        spawnGiftBody(type, radius, data = {}) {
            const { Bodies, World, Body } = Matter;
            const jar = this.jarCenter || { x: this.width / 2, topY: 100 };
            
            // Spawn directly above the jar opening
            const spawnX = jar.x + (Math.random() * 24 - 12);
            const spawnY = Math.max(20, jar.topY - 140 - Math.random() * 40);

            const restitution = type === 'rose' ? 0.2 : 0.3;
            const friction = type === 'rose' ? 0.2 : 0.12;

            const body = Bodies.circle(spawnX, spawnY, radius, {
                restitution,
                friction,
                frictionAir: 0.005,
                density: 0.002
            });

            body.giftType = type;
            body.giftData = data;
            body.giftRadius = radius;

            Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 1.5,
                y: Math.random() * 2 + 2
            });
            Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);

            // If image URL is provided dynamically from TikTok live, load it
            if (data.imageUrl && !this.imageCache[data.imageUrl]) {
                this.loadImage(data.imageUrl, data.imageUrl);
            }

            World.add(this.world, body);
            this.items.push(body);

            // Cap total items to maintain 60 FPS
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
                    this.spawnGiftBody('heart', 18, {
                        imageKey: 'heart',
                        name: 'Trái tim'
                    });
                }, i * 60);
            }
        }

        spawnDiamond(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('diamond', 26, {
                        imageKey: 'diamond',
                        name: 'Kim cương'
                    });
                }, i * 70);
            }
        }

        spawnCorgi() {
            this.spawnGiftBody('corgi', 30, {
                imageKey: 'corgi',
                name: 'Corgi'
            });
        }

        spawnMoneyGun() {
            this.spawnGiftBody('money_gun', 34, {
                imageKey: 'money_gun',
                name: 'Súng bắn tiền'
            });
        }

        spawnGalaxy() {
            this.spawnGiftBody('galaxy', 44, {
                imageKey: 'galaxy',
                name: 'Vũ trụ Galaxy'
            });
        }

        spawnLion() {
            this.spawnGiftBody('lion', 54, {
                imageKey: 'lion',
                name: 'Sư tử'
            });
        }

        spawnTopDonorBadge(rank = 1, nickname = 'Top Fan') {
            this.spawnGiftBody('top_donor', 28, {
                rank: rank || 1,
                nickname: nickname || 'Top 1'
            });
        }

        spawnLiveGift(giftData = {}) {
            const coins = Number(giftData.coins) || 1;
            const repeat = Math.min(15, Number(giftData.repeatCount) || 1);
            let radius = 14;
            let type = 'live_gift';

            if (coins >= 10000) radius = 54;
            else if (coins >= 1000) radius = 44;
            else if (coins >= 300) radius = 34;
            else if (coins >= 100) radius = 26;
            else if (coins >= 10) radius = 18;
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
                this.spawnRose(Math.floor(Math.random() * 8) + 4);
            } else if (tier === 'medium') {
                const choice = Math.random();
                if (choice < 0.4) this.spawnDiamond(2);
                else if (choice < 0.7) this.spawnCorgi();
                else this.spawnMoneyGun();
            } else if (tier === 'large') {
                const choice = Math.random();
                if (choice < 0.5) this.spawnGalaxy();
                else this.spawnLion();
            } else if (tier === 'top_donor') {
                this.spawnTopDonorBadge(1, 'Top 1 Supporter');
            } else {
                const roll = Math.random();
                if (roll < 0.55) this.spawnRose(Math.floor(Math.random() * 10) + 3);
                else if (roll < 0.72) this.spawnHeart(2);
                else if (roll < 0.85) this.spawnDiamond(1);
                else if (roll < 0.94) this.spawnMoneyGun();
                else this.spawnLion();
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

            // Draw each physical gift with its real TikTok image
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
                    // Avatar Badge with Gold Crown
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.fillStyle = 'linear-gradient(135deg, #f59e0b, #ef4444)';
                    ctx.fillStyle = '#f59e0b';
                    ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
                    ctx.shadowBlur = 10;
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = `900 10px "Inter", "Segoe UI", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`👑 #${data.rank || 1}`, 0, 0);
                } else {
                    const img = this.imageCache[data.imageUrl] || this.imageCache[data.imageKey || type];
                    if (img && img.complete && img.naturalWidth > 0) {
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 6;
                        ctx.shadowOffsetY = 2;
                        const size = r * 2.2;
                        ctx.drawImage(img, -size / 2, -size / 2, size, size);
                    } else {
                        // Fallback emoji while image loads
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
