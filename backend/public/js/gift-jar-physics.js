/**
 * LiveFlow Gift Jar 2D Physics Engine (Powered by Matter.js)
 * Implements real physical bouncing, rolling, stacking, and overflow
 * using REAL TikTok Live Gift Icons (Rose, Heart, Diamond, Corgi, Money Gun, Galaxy, Lion).
 */
(function(window) {
    'use strict';

    const GIFT_ASSETS = {
        rose: '/assets/gift-icons/Rose_5655.png',
        heart: '/assets/gift-icons/Beating_Heart_11809.png',
        diamond: '/assets/gift-icons/Diamond_16051.png',
        corgi: '/assets/gift-icons/Corgi.png',
        money_gun: '/assets/gift-icons/Money_Gun.png',
        galaxy: '/assets/gift-icons/Galaxy_11046.png',
        lion: '/assets/gift-icons/Lion_6369.png'
    };

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

            this.preloadImages();
            this.initCanvas();
            this.initPhysics();
            this.setupWalls();
            this.startLoop();
        }

        preloadImages() {
            Object.keys(GIFT_ASSETS).forEach(key => {
                const img = new Image();
                img.src = GIFT_ASSETS[key];
                this.imageCache[key] = img;
            });
        }

        initCanvas() {
            // Remove any existing physics canvas in container
            const oldCanvas = this.container.querySelector('.gift-jar-physics-canvas');
            if (oldCanvas) oldCanvas.remove();

            this.canvas = document.createElement('canvas');
            this.canvas.className = 'gift-jar-physics-canvas';
            this.canvas.style.cssText = `
                position: absolute;
                inset: 0;
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
            const rect = this.container.getBoundingClientRect();
            this.width = this.container.clientWidth || rect.width || 720;
            this.height = this.container.clientHeight || rect.height || 1280;
            this.dpr = window.devicePixelRatio || 1;

            this.canvas.width = this.width * this.dpr;
            this.canvas.height = this.height * this.dpr;
            this.canvas.style.width = `${this.width}px`;
            this.canvas.style.height = `${this.height}px`;

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
                const itemEl = jarWidget.closest('.gmd-item') || jarWidget;
                const cRect = this.container.getBoundingClientRect();
                const jRect = itemEl.getBoundingClientRect();
                return {
                    x: jRect.left - cRect.left,
                    y: jRect.top - cRect.top,
                    w: jRect.width,
                    h: jRect.height
                };
            }

            // Fallback default center-bottom
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

            // Screen Artboard Floor & Side walls
            const floor = Bodies.rectangle(w / 2, h + 20, w * 2, 50, { isStatic: true, friction: 0.5, label: 'floor' });
            const leftScreen = Bodies.rectangle(-20, h / 2, 50, h * 2, { isStatic: true, friction: 0.1, label: 'screen_left' });
            const rightScreen = Bodies.rectangle(w + 20, h / 2, 50, h * 2, { isStatic: true, friction: 0.1, label: 'screen_right' });
            this.wallBodies.push(floor, leftScreen, rightScreen);

            // Compute Jar Physics Box
            const jar = this.getJarRect();
            const jx = jar.x + jar.w / 2;
            const jy = jar.y + jar.h / 2;
            const jw = jar.w * 0.78;
            const jh = jar.h * 0.74;

            this.jarCenter = { x: jx, y: jy, w: jw, h: jh, topY: jar.y };

            const wallThickness = 16;
            const halfW = jw / 2;
            const halfH = jh / 2;

            // Jar Bottom Wall
            const jarBottom = Bodies.rectangle(jx, jy + halfH - 8, jw * 0.78, wallThickness, {
                isStatic: true, friction: 0.4, restitution: 0.2, label: 'jar_bottom'
            });

            // Jar Left Wall
            const jarLeft = Bodies.rectangle(jx - halfW + 8, jy + 10, wallThickness, jh * 0.75, {
                isStatic: true, friction: 0.15, restitution: 0.2, angle: 0.04, label: 'jar_left'
            });

            // Jar Right Wall
            const jarRight = Bodies.rectangle(jx + halfW - 8, jy + 10, wallThickness, jh * 0.75, {
                isStatic: true, friction: 0.15, restitution: 0.2, angle: -0.04, label: 'jar_right'
            });

            // Jar Left Funnel Lip
            const jarLipLeft = Bodies.rectangle(jx - halfW * 0.65, jy - halfH + 22, jw * 0.32, wallThickness, {
                isStatic: true, friction: 0.1, angle: -0.38, label: 'jar_lip_left'
            });

            // Jar Right Funnel Lip
            const jarLipRight = Bodies.rectangle(jx + halfW * 0.65, jy - halfH + 22, jw * 0.32, wallThickness, {
                isStatic: true, friction: 0.1, angle: 0.38, label: 'jar_lip_right'
            });

            this.wallBodies.push(jarBottom, jarLeft, jarRight, jarLipLeft, jarLipRight);
            World.add(this.world, this.wallBodies);
        }

        spawnGiftBody(type, radius, data = {}) {
            const { Bodies, World, Body } = Matter;
            const jar = this.jarCenter || { x: this.width / 2, topY: 100 };
            
            // Spawn directly above jar mouth
            const spawnX = jar.x + (Math.random() * 24 - 12);
            const spawnY = Math.max(10, jar.topY - 80 - Math.random() * 30);

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
                y: Math.random() * 2 + 1.5
            });
            Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);

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
                    this.spawnGiftBody('rose', 13, {
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
                    this.spawnGiftBody('diamond', 22, {
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
            this.spawnGiftBody('galaxy', 40, {
                imageKey: 'galaxy',
                name: 'Vũ trụ Galaxy'
            });
        }

        spawnLion() {
            this.spawnGiftBody('lion', 48, {
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

        spawnRandomGift(tier = 'random') {
            if (tier === 'small') {
                this.spawnRose(Math.floor(Math.random() * 8) + 4);
            } else if (tier === 'medium') {
                const choice = Math.random();
                if (choice < 0.5) this.spawnDiamond(2);
                else if (choice < 0.8) this.spawnCorgi();
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
            const dpr = this.dpr || 1;

            ctx.save();
            ctx.scale(dpr, dpr);
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
                    const img = this.imageCache[data.imageKey || type];
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
