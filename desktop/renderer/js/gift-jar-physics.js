/**
 * LiveFlow Gift Jar 2D Physics Engine (Powered by Matter.js)
 * Implements real physical bouncing, rolling, stacking, and overflow
 * with FULL 100% sync for:
 *   1. 🌹 Quà TikTok Live (645+ Real TikTok Gifts)
 *   2. 🍬 Kẹo ngọt (11 Real High-Res Candy PNGs từ D:\HỦ QUÀ)
 *   3. 💎 Kim cương quý (15 Real High-Res Diamond/Gem PNGs từ D:\HỦ QUÀ\KIM CUONG QUY)
 *   4. ⭐ Ngôi sao sáng (Star)
 * Features 3 capacity presets (Vừa / Trung bình / Nhiều), sleek form-fitting bottom (zero under-jar gaps),
 * Hard Internal Floor Guard (zero leakage guarantee), strict inside/outside gift separation (zero sucking),
 * and Dynamic Jar Movement physics.
 */
(function(window) {
    'use strict';

    const POPULAR_TIKTOK_GIFTS = [
        { id: 'rose', name: 'Hoa hồng', coins: 1, file: 'Rose_5655.png', radius: 11 },
        { id: 'heart', name: 'Trái tim', coins: 5, file: 'Beating_Heart_11809.png', radius: 12 },
        { id: 'doughnut', name: 'Bánh Donut', coins: 30, file: 'Doughnut.png', radius: 14 },
        { id: 'cap', name: 'Mũ TikTok', coins: 99, file: 'Wooly_Hat.png', radius: 15 },
        { id: 'diamond', name: 'Kim cương', coins: 100, file: 'Diamond_16051.png', radius: 17 },
        { id: 'corgi', name: 'Corgi', coins: 299, file: 'Corgi.png', radius: 18 },
        { id: 'money_gun', name: 'Súng bắn tiền', coins: 500, file: 'Money_Gun.png', radius: 20 },
        { id: 'whale', name: 'Cá voi lặn', coins: 1000, file: 'Whale_Diving_6820.png', radius: 22 },
        { id: 'galaxy', name: 'Vũ trụ Galaxy', coins: 1000, file: 'Galaxy_11046.png', radius: 23 },
        { id: 'dragon', name: 'Rồng lửa', coins: 10000, file: 'Dragon_Flame_7610.png', radius: 25 },
        { id: 'lion', name: 'Sư tử', coins: 29999, file: 'Lion_6369.png', radius: 26 },
        { id: 'zeus', name: 'Thần Zeus', coins: 34000, file: 'Zeus_8624.png', radius: 27 }
    ];

    // 11 Real Candy PNG Icons (Copied from D:\HỦ QUÀ)
    const REAL_CANDY_GIFTS = [
        { id: 'candy_1', name: 'Kẹo Dẻo Nho Tím', coins: 1, file: 'keo 1.png', radius: 11, tier: 'small' },
        { id: 'candy_2', name: 'Kẹo Đậu Dâu Đỏ', coins: 5, file: 'keo 2.png', radius: 12, tier: 'small' },
        { id: 'candy_3', name: 'Gấu Dẻo Cam Gummy', coins: 10, file: 'keo 3.png', radius: 13, tier: 'small' },
        { id: 'candy_4', name: 'Kẹo Caramen Sữa Béo', coins: 30, file: 'keo 4.png', radius: 14, tier: 'medium' },
        { id: 'candy_7', name: 'Kẹo Gói Nơ Hồng', coins: 50, file: 'keo 7.png', radius: 15, tier: 'medium' },
        { id: 'candy_8', name: 'Kẹo Gói Nơ Xanh', coins: 99, file: 'keo 8.png', radius: 16, tier: 'medium' },
        { id: 'candy_6', name: 'Kẹo Mật Ong Hổ Phách', coins: 100, file: 'keo 6.png', radius: 17, tier: 'medium' },
        { id: 'candy_5', name: 'Socola Truffle Hạnh Nhân', coins: 299, file: 'keo 5.png', radius: 19, tier: 'medium' },
        { id: 'candy_9', name: 'Kẹo Vòng Đào Đường Phèn', coins: 500, file: 'keo 9.png', radius: 21, tier: 'medium' },
        { id: 'candy_10', name: 'Kẹo Cuộn Cầu Vồng Rainbow', coins: 1000, file: 'keo 10.png', radius: 23, tier: 'large' },
        { id: 'candy_11', name: 'Kẹo Mút Khổng Lồ Lollipop', coins: 10000, file: 'keo 11.png', radius: 26, tier: 'large' }
    ];

    // 15 Real Diamond / Gem PNG Icons (Copied from D:\HỦ QUÀ\KIM CUONG QUY)
    const REAL_DIAMOND_GIFTS = [
        { id: 'gem_1', name: 'Ngọc Lục Bảo Emerald Vuông', coins: 1, file: 'kimcuong 1.png', radius: 11, tier: 'small' },
        { id: 'gem_2', name: 'Lam Ngọc Sapphire Biển Sâu', coins: 5, file: 'kimcuong 2.png', radius: 12, tier: 'small' },
        { id: 'gem_3', name: 'Thạch Anh Tím Amethyst', coins: 10, file: 'kimcuong 3.png', radius: 13, tier: 'small' },
        { id: 'gem_4', name: 'Hồng Ngọc Ruby Đỏ Lửa', coins: 30, file: 'kimcuong 4.png', radius: 14, tier: 'medium' },
        { id: 'gem_5', name: 'Hoàng Ngọc Topaz Vàng', coins: 50, file: 'kimcuong 5.png', radius: 15, tier: 'medium' },
        { id: 'gem_6', name: 'Ngọc Biển Aquamarine Lam', coins: 99, file: 'kimcuong 6.png', radius: 16, tier: 'medium' },
        { id: 'gem_7', name: 'Ngọc Bích Cẩm Thạch Jade', coins: 100, file: 'kimcuong 7.png', radius: 17, tier: 'medium' },
        { id: 'gem_8', name: 'Thạch Anh Ovan Tím Mộng', coins: 199, file: 'kimcuong 8.png', radius: 18, tier: 'medium' },
        { id: 'gem_9', name: 'Bảo Ngọc Opal Cầu Vồng', coins: 299, file: 'kimcuong 9.png', radius: 19, tier: 'medium' },
        { id: 'gem_10', name: 'Hổ Phách Hoàng Kim Amber', coins: 500, file: 'kimcuong 10.png', radius: 21, tier: 'medium' },
        { id: 'gem_11', name: 'Pha Lê Tinh Thể Hồng', coins: 1000, file: 'kimcuong 11.png', radius: 23, tier: 'large' },
        { id: 'gem_12', name: 'Kim Cương Trắng Tinh Khiết', coins: 3000, file: 'kimcuong 12.png', radius: 24, tier: 'large' },
        { id: 'gem_13', name: 'Đá Vũ Trụ Galaxy Giọt Nước', coins: 5000, file: 'kimcuong 13.png', radius: 25, tier: 'large' },
        { id: 'gem_14', name: 'Cụm Tinh Thể Bạch Ngọc Quartz', coins: 10000, file: 'kimcuong 14.png', radius: 26, tier: 'large' },
        { id: 'gem_15', name: 'Cụm Kim Cương Thần Thoại 7 Màu', coins: 30000, file: 'kimcuong 15.png', radius: 27, tier: 'large' }
    ];

    class GiftJarPhysics {
        constructor(container, options = {}) {
            this.container = typeof container === 'string' ? document.querySelector(container) : container;
            if (!this.container) return;

            this.options = Object.assign({
                gravity: 1.15,
                getItemRect: null,
                getCapacityLevel: null
            }, options);

            this.items = [];
            this.particles = [];
            this.wallBodies = [];
            this.imageCache = {};
            this.isRunning = false;
            this.animFrameId = null;
            this.lastWallSig = '';
            this.prevJarRect = null;
            this.dpr = Math.max(2, (window.devicePixelRatio || 1));

            this.preloadAllAssets();
            this.initCanvas();
            this.initPhysics();
            this.setupWalls();
            this.startLoop();
        }

        getCapacityScale() {
            let level = 'medium';
            if (typeof this.options.getCapacityLevel === 'function') {
                level = this.options.getCapacityLevel() || 'medium';
            } else {
                const jarWidget = this.container?.querySelector('.gmd-gift-jar-widget') || document.querySelector('.gmd-gift-jar-widget');
                if (jarWidget) {
                    const itemEl = jarWidget.closest('.gmd-item');
                    if (itemEl && itemEl.dataset && itemEl.dataset.capacityLevel) {
                        level = itemEl.dataset.capacityLevel || 'medium';
                    }
                }
            }

            if (level === 'small') return 1.50; // Vừa (~25 - 30 món quà -> Icon to nổi bật)
            if (level === 'large') return 0.80; // Nhiều (~120 - 150+ món quà -> Icon gọn gàng)
            return 1.10; // Trung bình (~60 - 70 món quà - Mặc định)
        }

        getAssetUrl(subfolder, filename) {
            if (!filename) return '';
            if (filename.startsWith('http://') || filename.startsWith('https://') || filename.startsWith('data:')) {
                return filename;
            }
            const clean = filename.replace(/^\/+/, '');
            const stripped = clean.replace(/^assets\/(gift-icons|candies|diamonds|jars|tiktok-gifts)\//, '');
            if (this.options && this.options.apiBase) {
                return `${this.options.apiBase}/assets/${subfolder}/${stripped}`;
            }
            if (typeof window !== 'undefined' && window.app && window.app.apiBase) {
                return `${window.app.apiBase}/assets/${subfolder}/${stripped}`;
            }
            return `assets/${subfolder}/${stripped}`;
        }

        preloadAllAssets() {
            this.loadImage('hu-thuong', this.getAssetUrl('jars', 'hu-thuong.png'));
            this.loadImage('hu-thuong-back', this.getAssetUrl('jars', 'hu-thuong-2.png'));
            POPULAR_TIKTOK_GIFTS.forEach(g => {
                this.loadImage(g.id, this.getAssetUrl('gift-icons', g.file));
            });
            REAL_CANDY_GIFTS.forEach(c => {
                this.loadImage(c.id, this.getAssetUrl('candies', c.file));
            });
            REAL_DIAMOND_GIFTS.forEach(d => {
                this.loadImage(d.id, this.getAssetUrl('diamonds', d.file));
            });
        }

        loadImage(key, src) {
            if (!src) return null;
            if (this.imageCache[key] && this.imageCache[key].complete && this.imageCache[key].naturalWidth > 0) {
                return this.imageCache[key];
            }
            const img = new Image();
            img.src = src;
            img.onload = () => {
                this.imageCache[key] = img;
            };
            img.onerror = () => {
                if (src.startsWith('assets/')) {
                    const fallback = new Image();
                    fallback.src = `../public/${src}`;
                    fallback.onload = () => {
                        this.imageCache[key] = fallback;
                    };
                    fallback.onerror = () => {
                        const fallback2 = new Image();
                        fallback2.src = `http://localhost:3000/${src}`;
                        fallback2.onload = () => {
                            this.imageCache[key] = fallback2;
                        };
                    };
                }
            };
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
                positionIterations: 20,
                velocityIterations: 16,
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
            const target = this.mountTarget || this.container;
            if (target && target.classList && (target.classList.contains('gmd-gift-jar-inner') || target.classList.contains('gmd-gift-jar-widget'))) {
                const w = target.offsetWidth || target.clientWidth || 450;
                const h = target.offsetHeight || target.clientHeight || 600;
                return { x: 0, y: 0, w, h };
            }

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

        getJarInnerRect() {
            const r = this.getJarRect();
            if (!r) return null;
            let w = r.w;
            let h = r.w;
            if (h > r.h) {
                h = r.h;
                w = r.h;
            }
            const offX = (r.w - w) / 2;
            const offY = (r.h - h) / 2;
            return {
                x: r.x + offX,
                y: r.y + offY,
                w: w,
                h: h
            };
        }

        checkAndSyncWalls() {
            const jar = this.getJarInnerRect();
            if (!jar) return;
            const bounds = this.getArtboardBounds();
            const sig = `${bounds.left.toFixed(1)},${bounds.top.toFixed(1)},${bounds.width.toFixed(1)},${bounds.height.toFixed(1)}|${jar.x.toFixed(1)},${jar.y.toFixed(1)},${jar.w.toFixed(1)},${jar.h.toFixed(1)}`;
            
            if (this.prevJarRect) {
                const dw = jar.w - this.prevJarRect.w;
                const dh = jar.h - this.prevJarRect.h;
                const dx = jar.x - this.prevJarRect.x;
                const dy = jar.y - this.prevJarRect.y;

                if (Math.abs(dw) > 0.5 || Math.abs(dh) > 0.5) {
                    const oldCenterX = this.prevJarRect.x + this.prevJarRect.w / 2;
                    const oldCenterY = this.prevJarRect.y + this.prevJarRect.h * 0.55;
                    const newCenterX = jar.x + jar.w / 2;
                    const newCenterY = jar.y + jar.h * 0.55;
                    const sx = jar.w / (this.prevJarRect.w || 1);
                    const sy = jar.h / (this.prevJarRect.h || 1);

                    for (let i = 0; i < this.items.length; i++) {
                        const b = this.items[i];
                        if (b.isInsideJar === true) {
                            const relX = b.position.x - oldCenterX;
                            const relY = b.position.y - oldCenterY;
                            Matter.Body.setPosition(b, {
                                x: newCenterX + relX * sx,
                                y: newCenterY + relY * sy
                            });
                        }
                    }
                } else if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
                    for (let i = 0; i < this.items.length; i++) {
                        const b = this.items[i];
                        if (b.isInsideJar === true) {
                            Matter.Body.setPosition(b, { x: b.position.x + dx, y: b.position.y + dy });
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

            const leftScreen = Bodies.rectangle(bounds.left - 25, (bounds.top + bounds.bottom) / 2, 50, bounds.height * 2, {
                isStatic: true, friction: 0.1, restitution: 0.1, label: 'screen_left'
            });
            const rightScreen = Bodies.rectangle(bounds.right + 25, (bounds.top + bounds.bottom) / 2, 50, bounds.height * 2, {
                isStatic: true, friction: 0.1, restitution: 0.1, label: 'screen_right'
            });
            const floor = Bodies.rectangle((bounds.left + bounds.right) / 2, bounds.bottom + 25, bounds.width + 100, 50, {
                isStatic: true, friction: 0.3, restitution: 0.15, label: 'floor'
            });
            this.wallBodies.push(floor, leftScreen, rightScreen);

            const jar = this.getJarInnerRect();
            if (!jar) return;
            const jx = jar.x + jar.w / 2;
            const jw = jar.w;
            const jh = jar.h;

            const bottomY = jar.y + jh * 0.93;
            const jarBottom = Bodies.rectangle(jx, bottomY, jw * 0.64, 6, {
                isStatic: true, friction: 0.80, restitution: 0.01, label: 'jar_bottom'
            });

            const leftX = jar.x + jw * 0.18;
            const jarLeft = Bodies.rectangle(leftX, jar.y + jh * 0.56, 14, jh * 0.72, {
                isStatic: true, friction: 0.05, restitution: 0.01, label: 'jar_left'
            });

            const rightX = jar.x + jw * 0.82;
            const jarRight = Bodies.rectangle(rightX, jar.y + jh * 0.56, 14, jh * 0.72, {
                isStatic: true, friction: 0.05, restitution: 0.01, label: 'jar_right'
            });

            // Solid Neck Collars (Prevents gifts bulging out through jar neck/rim)
            const neckLeft = Bodies.rectangle(jar.x + jw * 0.22, jar.y + jh * 0.14, 16, jh * 0.14, {
                isStatic: true, friction: 0.05, restitution: 0.01, label: 'jar_neck_left'
            });
            const neckRight = Bodies.rectangle(jar.x + jw * 0.78, jar.y + jh * 0.14, 16, jh * 0.14, {
                isStatic: true, friction: 0.05, restitution: 0.01, label: 'jar_neck_right'
            });

            // Inward Neck Lip Funnels (Guides gifts into body)
            const lipLeft = Bodies.rectangle(jar.x + jw * 0.22, jar.y + jh * 0.22, jw * 0.18, 16, {
                isStatic: true, friction: 0.01, angle: 0.55, label: 'jar_lip_left'
            });

            const lipRight = Bodies.rectangle(jar.x + jw * 0.78, jar.y + jh * 0.22, jw * 0.18, 16, {
                isStatic: true, friction: 0.01, angle: -0.55, label: 'jar_lip_right'
            });

            this.wallBodies.push(jarBottom, jarLeft, jarRight, neckLeft, neckRight, lipLeft, lipRight);
            World.add(this.world, this.wallBodies);
        }

        applyHardFloorGuard() {
            const jar = this.getJarInnerRect();
            if (!jar) return;
            const jarFloorY = jar.y + jar.h * 0.93;
            const innerLeft = jar.x + jar.w * 0.18;
            const innerRight = jar.x + jar.w * 0.82;
            const jarTopY = jar.y + jar.h * 0.10;

            for (let i = 0; i < this.items.length; i++) {
                const b = this.items[i];
                const r = b.giftRadius || 11;

                if (b.isInsideJar === true) {
                    const isSpilledOut = (
                        b.position.y < (jarTopY - 5) && (b.position.x < (innerLeft + 5) || b.position.x > (innerRight - 5))
                    ) || (
                        b.position.y >= jarTopY && (b.position.x < (innerLeft - 10) || b.position.x > (innerRight + 10))
                    );

                    if (isSpilledOut) {
                        b.isInsideJar = false;
                        b.friction = 0.08;
                        b.frictionAir = 0.001;
                        b.restitution = 0.20;
                    } else {
                        if (b.position.y > jarFloorY - r && b.position.y < jarFloorY + 25) {
                            Matter.Body.setPosition(b, {
                                x: b.position.x,
                                y: jarFloorY - r
                            });
                            if (b.velocity.y > 0) {
                                Matter.Body.setVelocity(b, { x: b.velocity.x * 0.7, y: 0 });
                            }
                        }
                    }
                } else {
                    if (b.position.y > jarFloorY && Math.abs(b.velocity.y) < 0.1 && Math.abs(b.velocity.x) < 0.05) {
                        const centerX = jar.x + jar.w / 2;
                        if (Math.abs(b.position.x - centerX) > 30 && b.position.y > jarFloorY + 10) {
                            const dir = b.position.x < centerX ? 0.04 : -0.04;
                            Matter.Body.applyForce(b, b.position, { x: dir * b.mass * 0.001, y: 0 });
                        }
                    }
                }
            }
        }

        spawnGiftBody(type, baseRadius, data = {}) {
            const { Bodies, World, Body } = Matter;
            
            this.checkAndSyncWalls();

            const jar = this.getJarInnerRect();
            if (!jar) return null;

            const bounds = this.getArtboardBounds();

            const mouthCenterX = jar.x + jar.w / 2;
            let spawnX = mouthCenterX + (Math.random() - 0.5) * (jar.w * 0.15);
            if (data.customSpawnX !== undefined) {
                spawnX = data.customSpawnX;
            }
            const spawnY = bounds.top - 20;

            const capScale = this.getCapacityScale();
            const r = Math.max(10, Math.round(baseRadius * (jar.w / 180) * capScale));

            const restitution = 0.01;
            const friction = 0.40;

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
            body.isInsideJar = true; // Born to fall into the jar cavity!

            Body.setVelocity(body, {
                x: 0,
                y: Math.random() * 0.5 + 2.4
            });
            Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.01);

            if (data.imageUrl && !this.imageCache[data.imageUrl]) {
                this.loadImage(data.imageUrl, data.imageUrl);
            }

            World.add(this.world, body);
            this.items.push(body);

            return body;
        }

        // ==================== TIKTOK GIFTS ====================
        spawnRose(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('rose', 11, {
                        imageKey: 'rose',
                        name: 'Hoa hồng'
                    });
                }, i * 45);
            }
        }

        spawnHeart(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('heart', 12, {
                        imageKey: 'heart',
                        name: 'Trái tim'
                    });
                }, i * 60);
            }
        }

        spawnDoughnut() {
            this.spawnGiftBody('doughnut', 14, {
                imageKey: 'doughnut',
                name: 'Bánh Donut'
            });
        }

        spawnCap() {
            this.spawnGiftBody('cap', 15, {
                imageKey: 'cap',
                name: 'Mũ TikTok'
            });
        }

        spawnDiamond(count = 1) {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('diamond', 17, {
                        imageKey: 'diamond',
                        name: 'Kim cương'
                    });
                }, i * 70);
            }
        }

        spawnCorgi() {
            this.spawnGiftBody('corgi', 18, {
                imageKey: 'corgi',
                name: 'Corgi'
            });
        }

        spawnMoneyGun() {
            this.spawnGiftBody('money_gun', 20, {
                imageKey: 'money_gun',
                name: 'Súng bắn tiền'
            });
        }

        spawnWhale() {
            this.spawnGiftBody('whale', 22, {
                imageKey: 'whale',
                name: 'Cá voi'
            });
        }

        spawnGalaxy() {
            this.spawnGiftBody('galaxy', 23, {
                imageKey: 'galaxy',
                name: 'Vũ trụ Galaxy'
            });
        }

        spawnDragon() {
            this.spawnGiftBody('dragon', 25, {
                imageKey: 'dragon',
                name: 'Rồng lửa'
            });
        }

        spawnLion() {
            this.spawnGiftBody('lion', 26, {
                imageKey: 'lion',
                name: 'Sư tử'
            });
        }

        spawnZeus() {
            this.spawnGiftBody('zeus', 27, {
                imageKey: 'zeus',
                name: 'Thần Zeus'
            });
        }

        spawnBombAndExplode(callback) {
            const bounds = this.getArtboardBounds();
            const jar = this.getJarInnerRect();
            const jarCenterX = jar ? (jar.x + jar.w / 2) : (this.width / 2);

            // Random horizontal position: 45% chance near jar mouth, 55% anywhere on screen
            let randSpawnX;
            if (Math.random() < 0.45 && jar) {
                randSpawnX = jarCenterX + (Math.random() - 0.5) * (jar.w * 0.75);
            } else {
                const minX = Math.max(30, bounds.left + 30);
                const maxX = Math.min(this.width - 30, bounds.left + bounds.width - 30);
                randSpawnX = minX + Math.random() * (maxX - minX);
            }

            const bombBody = this.spawnGiftBody('bomb', 26, {
                isBomb: true,
                customSpawnX: randSpawnX,
                name: 'Bom Nổ Hũ'
            });

            const sparkInterval = setInterval(() => {
                if (!bombBody || !bombBody.position) {
                    clearInterval(sparkInterval);
                    return;
                }
                const bx = bombBody.position.x;
                const by = bombBody.position.y - 20;
                for (let i = 0; i < 3; i++) {
                    this.particles.push({
                        x: bx + (Math.random() - 0.5) * 6,
                        y: by + (Math.random() - 0.5) * 6,
                        vx: (Math.random() - 0.5) * 6,
                        vy: -Math.random() * 6 - 2,
                        gravity: 0.2,
                        size: 3 + Math.random() * 3,
                        color: ['#f59e0b', '#ef4444', '#fde047', '#ffffff'][Math.floor(Math.random() * 4)],
                        alpha: 1.0,
                        decay: 0.04,
                        shape: 'star',
                        emoji: '✨'
                    });
                }
            }, 50);

            // Pre-explosion warning pulse at 550ms
            setTimeout(() => {
                if (bombBody) bombBody.preExploding = true;
            }, 520);

            // Detonate at 680ms
            setTimeout(() => {
                clearInterval(sparkInterval);
                this.explodePartial(bombBody, callback);
            }, 680);
        }

        createBombExplosion(bx, by) {
            // 1. Screen / Container physical shock shake
            if (this.canvas) {
                const origTransform = this.canvas.style.transform || '';
                let shakeCount = 0;
                const shakeInterval = setInterval(() => {
                    shakeCount++;
                    const shakeX = (Math.random() - 0.5) * 14;
                    const shakeY = (Math.random() - 0.5) * 12;
                    this.canvas.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
                    if (shakeCount > 6) {
                        clearInterval(shakeInterval);
                        this.canvas.style.transform = origTransform;
                    }
                }, 28);
            }

            // 2. Fiery expanding shockwave ring
            this.particles.push({
                x: bx,
                y: by,
                radius: 12,
                expandSpeed: 7,
                color: '#f97316',
                alpha: 1.0,
                decay: 0.05,
                shape: 'ring',
                size: 3.5
            });

            // 3. Blazing Core Fireballs (Expanding glowing fire cloud)
            for (let f = 0; f < 5; f++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 16;
                this.particles.push({
                    x: bx + Math.cos(angle) * dist,
                    y: by + Math.sin(angle) * dist,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -Math.random() * 4 - 1,
                    radius: 20 + Math.random() * 16,
                    expandSpeed: 4.0,
                    alpha: 1.0,
                    decay: 0.045,
                    shape: 'fireball'
                });
            }

            // 4. Jagged Comic Explosion Blast Star
            this.particles.push({
                x: bx,
                y: by,
                vx: 0,
                vy: 0,
                size: 48,
                expandSpeed: 4.5,
                alpha: 1.0,
                decay: 0.06,
                shape: 'spike'
            });

            // 5. Rolling Volumetric Dark Smoke Puffs drifting upwards
            const smokeColors = ['#1e293b', '#334155', '#475569', '#64748b'];
            for (let s = 0; s < 18; s++) {
                const angle = Math.random() * Math.PI * 2;
                const spd = 2 + Math.random() * 6;
                this.particles.push({
                    x: bx + (Math.random() - 0.5) * 22,
                    y: by + (Math.random() - 0.5) * 16,
                    vx: Math.cos(angle) * spd * 0.7,
                    vy: -Math.abs(Math.sin(angle) * spd) - (2 + Math.random() * 4),
                    gravity: -0.05,
                    size: 14 + Math.random() * 16,
                    expandSpeed: 1.2,
                    color: smokeColors[Math.floor(Math.random() * smokeColors.length)],
                    alpha: 0.85,
                    decay: 0.016 + Math.random() * 0.012,
                    shape: 'smoke'
                });
            }

            // 6. Flying TNT Shrapnel & Burning Embers
            for (let e = 0; e < 25; e++) {
                const angle = Math.random() * Math.PI * 2;
                const spd = 6 + Math.random() * 15;
                this.particles.push({
                    x: bx,
                    y: by,
                    vx: Math.cos(angle) * spd,
                    vy: Math.sin(angle) * spd - 6,
                    gravity: 0.45,
                    size: 3 + Math.random() * 4,
                    color: Math.random() < 0.65 ? '#ef4444' : '#f59e0b',
                    alpha: 1.0,
                    decay: 0.025 + Math.random() * 0.02,
                    shape: 'ember'
                });
            }
        }

        explodePartial(bombBody, callback) {
            const { World } = Matter;
            const jar = this.getJarInnerRect();
            const bombX = bombBody?.position?.x || (this.width / 2);
            const bombY = bombBody?.position?.y || (this.height * 0.7);

            // Remove bomb itself from physics world
            if (bombBody && this.world) {
                World.remove(this.world, bombBody);
                const bIdx = this.items.indexOf(bombBody);
                if (bIdx >= 0) this.items.splice(bIdx, 1);
            }

            // 1. Fiery Bomb Explosion with Smoke and Fireballs
            this.createBombExplosion(bombX, bombY);

            const otherItems = this.items.filter(b => b !== bombBody && !b.exploding);

            // Check if bomb hit inside or close enough to the jar
            const isNearJar = jar && (
                bombX >= jar.x - 30 &&
                bombX <= jar.x + jar.w + 30 &&
                bombY >= jar.y - 40 &&
                bombY <= jar.y + jar.h + 50
            );

            if (!isNearJar || !otherItems.length) {
                // Bomb landed outside! Jar is safe!
                otherItems.forEach(b => {
                    Matter.Body.setVelocity(b, {
                        x: b.velocity.x + (Math.random() - 0.5) * 3,
                        y: b.velocity.y - 2 - Math.random() * 2
                    });
                });
                if (typeof callback === 'function') {
                    callback({ isHit: false, destroyedCount: 0, totalCount: otherItems.length, ratio: 0 });
                }
                return;
            }

            // 2. Separate gifts: ~35% - 45% nearest gifts get destroyed; remainder survive
            const itemsWithDist = otherItems.map(b => {
                const dx = b.position.x - bombX;
                const dy = b.position.y - bombY;
                return { body: b, dist: Math.hypot(dx, dy) };
            });
            itemsWithDist.sort((a, b) => a.dist - b.dist);

            // Destroy approximately 35% - 45% of the gifts in the jar
            const destroyPercent = 0.35 + Math.random() * 0.12;
            const destroyCount = Math.max(1, Math.min(itemsWithDist.length, Math.ceil(itemsWithDist.length * destroyPercent)));
            const destroyedItems = itemsWithDist.slice(0, destroyCount).map(entry => entry.body);
            const survivingItems = itemsWithDist.slice(destroyCount).map(entry => entry.body);

            // 3. Blast and explode only the destroyed items
            destroyedItems.forEach(b => {
                b.collisionFilter.mask = 0; // Disable collision so they fly outward
                b.exploding = true;
                b.opacity = 1.0;
                b.scale = 1.0;

                const dx = b.position.x - bombX;
                const dy = b.position.y - bombY;
                const dist = Math.max(5, Math.hypot(dx, dy));
                const forceX = (dx / dist) * (14 + Math.random() * 16) + (Math.random() - 0.5) * 10;
                const forceY = -Math.abs(dy / dist) * (18 + Math.random() * 16) - (12 + Math.random() * 12);

                Matter.Body.setVelocity(b, { x: forceX, y: forceY });
                Matter.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.8);

                for (let k = 0; k < 4; k++) {
                    this.particles.push({
                        x: b.position.x,
                        y: b.position.y,
                        vx: (Math.random() - 0.5) * 12,
                        vy: -Math.random() * 12 - 2,
                        gravity: 0.3,
                        size: 3 + Math.random() * 3,
                        color: ['#fde047', '#f43f5e', '#38bdf8', '#c084fc', '#ffffff'][Math.floor(Math.random() * 5)],
                        alpha: 1.0,
                        decay: 0.025 + Math.random() * 0.02,
                        shape: Math.random() < 0.4 ? 'star' : 'circle'
                    });
                }
            });

            // 4. Surviving items receive a realistic shockwave bounce
            survivingItems.forEach(b => {
                const dx = b.position.x - bombX;
                const dy = b.position.y - bombY;
                const dist = Math.max(10, Math.hypot(dx, dy));
                const shockForce = Math.max(2, 14 - dist * 0.06);
                Matter.Body.setVelocity(b, {
                    x: b.velocity.x + (dx / dist) * shockForce + (Math.random() - 0.5) * 3,
                    y: b.velocity.y - shockForce * 0.7 - Math.random() * 3
                });
            });

            // 5. Cleanup destroyed items from physics world after ~800ms
            setTimeout(() => {
                if (this.world && destroyedItems.length) {
                    World.remove(this.world, destroyedItems);
                    this.items = this.items.filter(item => !destroyedItems.includes(item));
                }
                const destroyedRatio = otherItems.length > 0 ? (destroyCount / otherItems.length) : 0.4;
                if (typeof callback === 'function') {
                    callback({ isHit: true, destroyedCount: destroyCount, totalCount: otherItems.length, ratio: destroyedRatio });
                }
            }, 800);
        }

        spawnTopDonorBadge(rank = 1, nickname = 'Top Fan', avatarUrl = '', userId = '') {
            const numRank = Number(rank) || 1;
            const radius = numRank === 1 ? 24 : (numRank <= 3 ? 21 : 19);
            this.spawnGiftBody('top_donor', radius, {
                rank: numRank,
                nickname: nickname || `Top ${numRank}`,
                avatarUrl: avatarUrl || '',
                userId: userId || nickname || `user_${numRank}`
            });
        }

        syncTopDonors(topDonors = []) {
            if (!Array.isArray(topDonors)) return;
            const donorBodies = this.items.filter(b => b.giftType === 'top_donor');

            topDonors.forEach((donor, idx) => {
                const rank = Number(donor.rank || (idx + 1));
                const userId = String(donor.userId || donor.uniqueId || donor.nickname || `user_${rank}`);
                const nickname = donor.nickname || donor.name || `Top ${rank}`;
                const avatarUrl = donor.avatarUrl || donor.profilePictureUrl || '';

                // Check if this donor already has a badge in the jar
                const existing = donorBodies.find(b => {
                    const data = b.giftData || {};
                    return (data.userId && data.userId === userId) || (data.nickname && data.nickname === nickname);
                });

                if (existing) {
                    const oldRank = existing.giftData.rank;
                    existing.giftData.rank = rank;
                    existing.giftData.nickname = nickname;
                    if (avatarUrl) existing.giftData.avatarUrl = avatarUrl;
                    if (oldRank !== rank) {
                        // Small hop impulse to celebrate or highlight rank shift
                        Matter.Body.setVelocity(existing, {
                            x: (Math.random() - 0.5) * 2.5,
                            y: -4.5
                        });
                    }
                } else if (rank <= 5) {
                    // Drop a brand new badge if newly entering Top 5
                    this.spawnTopDonorBadge(rank, nickname, avatarUrl, userId);
                }
            });
        }

        // ==================== REAL CANDY ICONS (11 PNGs) ====================
        spawnCandyItem(candyId, count = 1) {
            const candy = REAL_CANDY_GIFTS.find(c => c.id === candyId) || REAL_CANDY_GIFTS[0];
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('candy', candy.radius, {
                        imageKey: candy.id,
                        name: candy.name,
                        coins: candy.coins
                    });
                }, i * 45);
            }
        }

        spawnCandy(count = 1, tier = 'small') {
            const pool = REAL_CANDY_GIFTS.filter(c => c.tier === tier);
            const candidates = pool.length ? pool : REAL_CANDY_GIFTS;
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    const candy = candidates[Math.floor(Math.random() * candidates.length)];
                    this.spawnGiftBody('candy', candy.radius, {
                        imageKey: candy.id,
                        name: candy.name,
                        coins: candy.coins
                    });
                }, i * 45);
            }
        }

        // ==================== REAL DIAMOND / GEM ICONS (15 PNGs) ====================
        spawnGemItem(gemId, count = 1) {
            const gem = REAL_DIAMOND_GIFTS.find(d => d.id === gemId) || REAL_DIAMOND_GIFTS[0];
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('gem', gem.radius, {
                        imageKey: gem.id,
                        name: gem.name,
                        coins: gem.coins
                    });
                }, i * 45);
            }
        }

        spawnDiamondGem(count = 1, tier = 'small') {
            const pool = REAL_DIAMOND_GIFTS.filter(d => d.tier === tier);
            const candidates = pool.length ? pool : REAL_DIAMOND_GIFTS;
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    const gem = candidates[Math.floor(Math.random() * candidates.length)];
                    this.spawnGiftBody('gem', gem.radius, {
                        imageKey: gem.id,
                        name: gem.name,
                        coins: gem.coins
                    });
                }, i * 45);
            }
        }

        // ==================== STAR OPTION ====================
        spawnStar(count = 1, tier = 'small') {
            const radii = { small: 11, medium: 16, large: 23 };
            const baseR = radii[tier] || 12;
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    this.spawnGiftBody('star', baseR, {
                        name: 'Ngôi sao sáng',
                        isBig: tier === 'large'
                    });
                }, i * 45);
            }
        }

        spawnLiveGift(giftData = {}) {
            const coins = Number(giftData.coins) || 1;
            const repeat = Math.min(15, Number(giftData.repeatCount) || 1);
            let baseRadius = 11;
            let type = 'live_gift';

            if (coins >= 10000) baseRadius = 26;
            else if (coins >= 1000) baseRadius = 22;
            else if (coins >= 300) baseRadius = 18;
            else if (coins >= 100) baseRadius = 16;
            else if (coins >= 10) baseRadius = 13;
            else baseRadius = 11;

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

                this.checkAndSyncWalls();

                for (let i = 0; i < this.items.length; i++) {
                    const b = this.items[i];
                    if (Math.abs(b.velocity.x) < 0.04 && Math.abs(b.velocity.y) < 0.04) {
                        Matter.Body.setVelocity(b, { x: 0, y: 0 });
                        Matter.Body.setAngularVelocity(b, 0);
                    }
                }

                Matter.Engine.update(this.engine, delta);
                this.applyHardFloorGuard();
                this.render();

                this.animFrameId = requestAnimationFrame(loop);
            };

            this.animFrameId = requestAnimationFrame(loop);
        }

        drawTintedImage(img, x, y, w, h, tintColor, alpha = 0.50) {
            if (!img || !img.complete || img.naturalWidth <= 0) return;
            if (!tintColor || tintColor === '#ffffff' || tintColor === 'transparent') {
                this.ctx.drawImage(img, x, y, w, h);
                return;
            }
            if (!this.tintCanvas) {
                this.tintCanvas = document.createElement('canvas');
                this.tintCtx = this.tintCanvas.getContext('2d');
            }
            const tc = this.tintCanvas;
            const tctx = this.tintCtx;
            if (tc.width !== img.naturalWidth || tc.height !== img.naturalHeight) {
                tc.width = img.naturalWidth;
                tc.height = img.naturalHeight;
            } else {
                tctx.clearRect(0, 0, tc.width, tc.height);
            }

            tctx.drawImage(img, 0, 0);
            tctx.save();
            tctx.globalCompositeOperation = 'source-atop';
            tctx.fillStyle = tintColor;
            tctx.globalAlpha = alpha;
            tctx.fillRect(0, 0, tc.width, tc.height);
            tctx.restore();

            this.ctx.drawImage(tc, x, y, w, h);
        }

        drawFallbackGlassJar(x, y, w, h, jarColor) {
            const ctx = this.ctx;
            ctx.save();
            ctx.strokeStyle = jarColor || 'rgba(244, 114, 182, 0.75)';
            ctx.lineWidth = 3.5;
            ctx.shadowColor = jarColor || 'rgba(244, 114, 182, 0.6)';
            ctx.shadowBlur = 12;

            const mouthW = w * 0.42;
            const mouthH = h * 0.10;
            const mx = x + (w - mouthW) / 2;
            const my = y + h * 0.05;

            // Mouth rim
            ctx.beginPath();
            ctx.ellipse(mx + mouthW / 2, my + mouthH / 2, mouthW / 2, mouthH / 2, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Jar body
            ctx.beginPath();
            ctx.moveTo(mx, my + mouthH / 2);
            ctx.bezierCurveTo(x + w * 0.05, y + h * 0.22, x, y + h * 0.45, x + w * 0.04, y + h * 0.88);
            ctx.bezierCurveTo(x + w * 0.08, y + h * 0.98, x + w * 0.92, y + h * 0.98, x + w * 0.96, y + h * 0.88);
            ctx.bezierCurveTo(x + w, y + h * 0.45, x + w * 0.95, y + h * 0.22, mx + mouthW, my + mouthH / 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        render() {
            if (!this.ctx || !this.canvas) return;
            const jarWidget = this.container.querySelector('.gmd-gift-jar-widget') || document.querySelector('.gmd-gift-jar-widget');
            if (!jarWidget) {
                if (this.items.length) this.reset();
                return;
            }
            const ctx = this.ctx;
            const dpr = this.dpr || 1;
            const jar = this.getJarInnerRect();

            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, this.width, this.height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const curItem = typeof this.options.getItem === 'function' ? this.options.getItem() : null;
            const theme = curItem?.theme || jarWidget?.dataset?.theme || 'hu-thuong';
            const jarColor = curItem?.jarColor || jarWidget?.dataset?.jarColor || '';
            const ribbonUrl = curItem?.ribbonImageUrl || '';

            // 1. Draw Back Glass Layer (hu-thuong-2.png) BEHIND GIFTS
            if ((theme === 'hu-thuong' || !theme) && jar && jar.w > 0 && jar.h > 0) {
                const backImg = this.imageCache['hu-thuong-back'] || this.loadImage('hu-thuong-back', this.getAssetUrl('jars', 'hu-thuong-2.png'));
                if (backImg && backImg.complete && backImg.naturalWidth > 0) {
                    this.drawTintedImage(backImg, jar.x, jar.y, jar.w, jar.h, jarColor, 0.50);
                } else {
                    this.drawFallbackGlassJar(jar.x, jar.y, jar.w, jar.h, jarColor);
                }
            }

            // 2. Draw Falling / Settled Gifts
            for (let i = 0; i < this.items.length; i++) {
                const b = this.items[i];
                const x = b.position.x;
                const y = b.position.y;
                const angle = b.angle;
                const r = b.giftRadius || 11;
                const type = b.giftType;
                const data = b.giftData || {};

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);

                if (b.exploding) {
                    b.opacity = Math.max(0, (b.opacity !== undefined ? b.opacity : 1.0) - 0.035);
                    b.scale = Math.max(0, (b.scale !== undefined ? b.scale : 1.0) - 0.015);
                    ctx.globalAlpha = Math.max(0, b.opacity);
                    ctx.scale(b.scale, b.scale);
                }

                if (type === 'bomb') {
                    if (b.preExploding) {
                        ctx.scale(1.35, 1.35);
                        ctx.shadowColor = '#ef4444';
                        ctx.shadowBlur = 24;
                    }

                    // Draw Glossy 3D Bomb with burning fuse
                    ctx.beginPath();
                    ctx.arc(0, 4, r * 0.9, 0, Math.PI * 2);
                    const bombGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.2, 1, 0, 4, r * 0.95);
                    if (b.preExploding) {
                        bombGrad.addColorStop(0, '#fca5a5');
                        bombGrad.addColorStop(0.4, '#ef4444');
                        bombGrad.addColorStop(1, '#7f1d1d');
                    } else {
                        bombGrad.addColorStop(0, '#64748b');
                        bombGrad.addColorStop(0.3, '#1e293b');
                        bombGrad.addColorStop(0.8, '#0f172a');
                        bombGrad.addColorStop(1, '#020617');
                    }
                    ctx.fillStyle = bombGrad;
                    ctx.fill();
                    ctx.strokeStyle = b.preExploding ? '#f87171' : '#334155';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    // Bomb nozzle
                    ctx.fillStyle = '#475569';
                    ctx.fillRect(-r * 0.25, -r * 0.95, r * 0.5, r * 0.3);

                    // Fuse curve
                    ctx.beginPath();
                    ctx.moveTo(0, -r * 0.95);
                    ctx.quadraticCurveTo(r * 0.4, -r * 1.35, r * 0.2, -r * 1.55);
                    ctx.strokeStyle = '#d97706';
                    ctx.lineWidth = 2.5;
                    ctx.stroke();

                    // Fuse Flame & Spark
                    ctx.font = `${Math.round(r * 0.9)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🔥', r * 0.25, -r * 1.6);

                    // Skull / Danger Icon in center of bomb
                    ctx.font = `bold ${Math.round(r * 0.85)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('💣', 0, 4);
                } else if (type === 'top_donor') {
                    const rank = Number(data.rank) || 1;
                    const avatarUrl = data.avatarUrl || data.profilePictureUrl || data.avatar || '';
                    const avatarImg = avatarUrl ? (this.imageCache[avatarUrl] || this.loadImage(avatarUrl, avatarUrl)) : null;
                    const hasAvatar = avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0;

                    let ringColor = '#fbbf24';
                    let badgeBg = '#f59e0b';
                    let badgeEmoji = '👑';

                    if (rank === 1) {
                        ringColor = '#fbbf24';
                        badgeBg = '#d97706';
                        badgeEmoji = '👑';
                    } else if (rank === 2) {
                        ringColor = '#e2e8f0';
                        badgeBg = '#64748b';
                        badgeEmoji = '🥈';
                    } else if (rank === 3) {
                        ringColor = '#fdba74';
                        badgeBg = '#c2410c';
                        badgeEmoji = '🥉';
                    } else if (rank === 4) {
                        ringColor = '#e879f9';
                        badgeBg = '#7e22ce';
                        badgeEmoji = '💎';
                    } else {
                        ringColor = '#67e8f9';
                        badgeBg = '#0e7490';
                        badgeEmoji = '💎';
                    }

                    if (hasAvatar) {
                        // 1. Draw circular avatar clipped cleanly inside the medal
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
                        ctx.clip();
                        ctx.drawImage(avatarImg, -(r - 2), -(r - 2), (r - 2) * 2, (r - 2) * 2);
                        ctx.restore();

                        // 2. Shiny Outer Ring (Gold/Silver/Bronze/Purple/Cyan)
                        ctx.beginPath();
                        ctx.arc(0, 0, r, 0, Math.PI * 2);
                        ctx.strokeStyle = ringColor;
                        ctx.lineWidth = 3;
                        ctx.stroke();

                        // 3. Inner fine white border
                        ctx.beginPath();
                        ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                        ctx.lineWidth = 1.2;
                        ctx.stroke();

                        // 4. Rank Badge Crown / Pill at the bottom center of the circular avatar
                        const tagH = Math.round(r * 0.62);
                        const tagW = Math.round(r * 1.35);
                        const tagY = r * 0.45;

                        ctx.save();
                        ctx.beginPath();
                        if (typeof ctx.roundRect === 'function') {
                            ctx.roundRect(-tagW / 2, tagY - tagH / 2, tagW, tagH, tagH / 2);
                        } else {
                            ctx.rect(-tagW / 2, tagY - tagH / 2, tagW, tagH);
                        }
                        ctx.fillStyle = ringColor;
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                        ctx.shadowBlur = 4;
                        ctx.fill();
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.restore();

                        ctx.fillStyle = '#0f172a';
                        ctx.font = `900 ${Math.max(9, Math.round(tagH * 0.72))}px "Inter", "Segoe UI", sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${badgeEmoji} #${rank}`, 0, tagY);
                    } else {
                        // Radiant gradient medal fallback when avatar is not yet loaded
                        const grad = ctx.createLinearGradient(-r, -r, r, r);
                        if (rank === 1) {
                            grad.addColorStop(0, '#fef08a');
                            grad.addColorStop(0.5, '#f59e0b');
                            grad.addColorStop(1, '#b45309');
                        } else if (rank === 2) {
                            grad.addColorStop(0, '#ffffff');
                            grad.addColorStop(0.5, '#cbd5e1');
                            grad.addColorStop(1, '#64748b');
                        } else if (rank === 3) {
                            grad.addColorStop(0, '#ffedd5');
                            grad.addColorStop(0.5, '#f97316');
                            grad.addColorStop(1, '#9a3412');
                        } else if (rank === 4) {
                            grad.addColorStop(0, '#fae8ff');
                            grad.addColorStop(0.5, '#c084fc');
                            grad.addColorStop(1, '#7e22ce');
                        } else {
                            grad.addColorStop(0, '#ecfeff');
                            grad.addColorStop(0.5, '#22d3ee');
                            grad.addColorStop(1, '#0e7490');
                        }

                        ctx.beginPath();
                        ctx.arc(0, 0, r, 0, Math.PI * 2);
                        ctx.fillStyle = grad;
                        ctx.fill();

                        // Outer glossy ring
                        ctx.strokeStyle = ringColor;
                        ctx.lineWidth = 2.5;
                        ctx.stroke();

                        // Inner reflective highlight ring
                        ctx.beginPath();
                        ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        // Text
                        ctx.fillStyle = '#ffffff';
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
                        ctx.shadowBlur = 4;
                        ctx.font = `900 ${Math.max(10, r * 0.70)}px "Inter", "Segoe UI", sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${badgeEmoji} #${rank}`, 0, 1);
                        ctx.shadowBlur = 0;
                    }
                } else if (type === 'star') {
                    ctx.beginPath();
                    const spikes = 5;
                    const outerRadius = r * 1.15;
                    const innerRadius = r * 0.52;
                    let rot = (Math.PI / 2) * 3;
                    let step = Math.PI / spikes;

                    ctx.moveTo(0, -outerRadius);
                    for (let s = 0; s < spikes; s++) {
                        let sx = Math.cos(rot) * outerRadius;
                        let sy = Math.sin(rot) * outerRadius;
                        ctx.lineTo(sx, sy);
                        rot += step;

                        sx = Math.cos(rot) * innerRadius;
                        sy = Math.sin(rot) * innerRadius;
                        ctx.lineTo(sx, sy);
                        rot += step;
                    }
                    ctx.lineTo(0, -outerRadius);
                    ctx.closePath();

                    const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 1, 0, 0, r * 1.2);
                    grad.addColorStop(0, '#fffbeb');
                    grad.addColorStop(0.4, '#fde047');
                    grad.addColorStop(1, '#d97706');
                    ctx.fillStyle = grad;
                    ctx.fill();

                    ctx.strokeStyle = '#b45309';
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                } else {
                    const img = this.imageCache[data.imageUrl] || this.imageCache[data.imageKey || type];
                    if (img && img.complete && img.naturalWidth > 0) {
                        const size = r * 2.2;
                        ctx.drawImage(img, -size / 2, -size / 2, size, size);
                    } else {
                        ctx.font = `${r * 2}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(type === 'gem' ? '💎' : type === 'candy' ? '🍬' : type === 'rose' ? '🌹' : '🎁', 0, 0);
                    }
                }

                ctx.restore();
            }

            // 2.5 Draw Explosion Fireworks & Sparkle Particles
            if (this.particles && this.particles.length > 0) {
                for (let i = this.particles.length - 1; i >= 0; i--) {
                    const p = this.particles[i];
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += p.gravity || 0;
                    p.vx *= 0.98;
                    p.alpha -= p.decay || 0.025;
                    p.size = Math.max(0.5, p.size * 0.96);

                    if (p.alpha <= 0 || p.size <= 0.5) {
                        this.particles.splice(i, 1);
                        continue;
                    }

                    ctx.save();
                    ctx.globalAlpha = Math.max(0, p.alpha);

                    if (p.shape === 'fireball') {
                        p.radius = (p.radius || 15) + (p.expandSpeed || 3.5);
                        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
                        grad.addColorStop(0, '#ffffff');
                        grad.addColorStop(0.25, '#fef08a');
                        grad.addColorStop(0.6, '#f97316');
                        grad.addColorStop(0.9, '#dc2626');
                        grad.addColorStop(1, 'rgba(220, 38, 38, 0)');
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (p.shape === 'smoke') {
                        p.size = (p.size || 15) + (p.expandSpeed || 1.1);
                        ctx.fillStyle = p.color || '#334155';
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (p.shape === 'spike') {
                        p.size = (p.size || 40) + (p.expandSpeed || 3.2);
                        ctx.font = `bold ${Math.round(p.size * 1.4)}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('💥', p.x, p.y);
                    } else if (p.shape === 'ring') {
                        p.radius = (p.radius || 6) + (p.expandSpeed || 4.5);
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                        ctx.strokeStyle = p.color || '#ffffff';
                        ctx.lineWidth = Math.max(0.8, p.size || 2.5);
                        ctx.shadowColor = p.color || '#ffffff';
                        ctx.shadowBlur = 8;
                        ctx.stroke();
                    } else if (p.shape === 'star') {
                        ctx.font = `${Math.round(p.size * 2)}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.shadowColor = p.color || '#f59e0b';
                        ctx.shadowBlur = 6;
                        ctx.fillText(p.emoji || '✨', p.x, p.y);
                    } else {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                        ctx.fillStyle = p.color || '#fbbf24';
                        ctx.shadowColor = p.color || '#f59e0b';
                        ctx.shadowBlur = 6;
                        ctx.fill();
                    }
                    ctx.restore();
                }
            }

            // 3. Draw Front Glass Layer (hu-thuong.png) ON TOP OF GIFTS
            if ((theme === 'hu-thuong' || !theme) && jar && jar.w > 0 && jar.h > 0) {
                const frontImg = this.imageCache['hu-thuong'] || this.loadImage('hu-thuong', this.getAssetUrl('jars', 'hu-thuong.png'));
                this.drawTintedImage(frontImg, jar.x, jar.y, jar.w, jar.h, jarColor, 0.50);
            }

            // 4. Draw Ribbon/Bow over Jar Neck (Layer 4 - Frontmost)
            if (ribbonUrl && jar && jar.w > 0 && jar.h > 0) {
                const ribbonImg = this.imageCache[ribbonUrl] || this.loadImage(ribbonUrl, ribbonUrl);
                if (ribbonImg && ribbonImg.complete && ribbonImg.naturalWidth > 0) {
                    const rw = jar.w * 0.58;
                    const rh = (rw / ribbonImg.naturalWidth) * ribbonImg.naturalHeight;
                    const rx = jar.x + (jar.w - rw) / 2;
                    const ry = jar.y + jar.h * 0.12 - rh * 0.40;
                    ctx.drawImage(ribbonImg, rx, ry, rw, rh);
                }
            }

            ctx.restore();
        }

        createFireworkBurst(cx, cy, colorTheme = 'gold', count = 30) {
            const palettes = {
                gold: ['#fde047', '#f59e0b', '#d97706', '#ffffff', '#fbbf24'],
                pink: ['#f472b6', '#ec4899', '#db2777', '#ffffff', '#fda4af'],
                cyan: ['#38bdf8', '#06b6d4', '#0284c7', '#ffffff', '#7dd3fc'],
                purple: ['#c084fc', '#a855f7', '#7e22ce', '#ffffff', '#e9d5ff'],
                multi: ['#fde047', '#f43f5e', '#38bdf8', '#c084fc', '#4ade80', '#ffffff', '#fb923c']
            };
            const colors = palettes[colorTheme] || palettes.multi;

            // 1. Expanding glowing shockwave ring
            this.particles.push({
                x: cx,
                y: cy,
                vx: 0,
                vy: 0,
                radius: 6,
                expandSpeed: 4.5,
                color: colors[0],
                alpha: 1.0,
                decay: 0.04,
                shape: 'ring',
                size: 2.5
            });

            // 2. Multi-color radial sparks & sparkles
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 4 + Math.random() * 16;
                const clr = colors[Math.floor(Math.random() * colors.length)];
                this.particles.push({
                    x: cx,
                    y: cy,
                    vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 4,
                    vy: Math.sin(angle) * speed - (3 + Math.random() * 6),
                    gravity: 0.28,
                    size: 3 + Math.random() * 4,
                    color: clr,
                    alpha: 1.0,
                    decay: 0.018 + Math.random() * 0.015,
                    shape: Math.random() < 0.35 ? 'star' : 'circle',
                    emoji: Math.random() < 0.5 ? '✨' : '⭐'
                });
            }
        }

        explodeAndReset(callback) {
            if (!this.world || !this.items.length) {
                this.reset(false);
                if (typeof callback === 'function') callback();
                return;
            }

            const jar = this.getJarInnerRect();
            const jarW = jar.w || 300;
            const jarH = jar.h || 400;

            // 6 distinct explosion & firework burst points across and above the jar
            const bursts = [
                { x: jar.x + jarW * 0.35, y: jar.y + jarH * 0.70, theme: 'gold', delay: 0 },
                { x: jar.x + jarW * 0.65, y: jar.y + jarH * 0.65, theme: 'pink', delay: 50 },
                { x: jar.x + jarW * 0.50, y: jar.y + jarH * 0.85, theme: 'multi', delay: 100 },
                { x: jar.x + jarW * 0.20, y: jar.y + jarH * 0.35, theme: 'cyan', delay: 160 },
                { x: jar.x + jarW * 0.80, y: jar.y + jarH * 0.30, theme: 'purple', delay: 230 },
                { x: jar.x + jarW * 0.50, y: jar.y + jarH * 0.12, theme: 'multi', delay: 300 }
            ];

            // 1. Blast every item outward with explosive velocity and spin
            this.items.forEach(b => {
                b.collisionFilter.mask = 0; // Disable collision so items fly freely out
                b.exploding = true;
                b.opacity = 1.0;
                b.scale = 1.0;

                const nearestBurst = bursts[Math.floor(Math.random() * 3)];
                const dx = b.position.x - nearestBurst.x;
                const dy = b.position.y - nearestBurst.y;
                const dist = Math.max(5, Math.hypot(dx, dy));
                const forceX = (dx / dist) * (15 + Math.random() * 18) + (Math.random() - 0.5) * 12;
                const forceY = -Math.abs(dy / dist) * (18 + Math.random() * 18) - (15 + Math.random() * 15);

                Matter.Body.setVelocity(b, { x: forceX, y: forceY });
                Matter.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.9);

                // Small sparkles from each flying gift
                for (let k = 0; k < 4; k++) {
                    this.particles.push({
                        x: b.position.x,
                        y: b.position.y,
                        vx: (Math.random() - 0.5) * 12,
                        vy: -Math.random() * 12 - 2,
                        gravity: 0.3,
                        size: 3 + Math.random() * 3,
                        color: ['#fde047', '#f43f5e', '#38bdf8', '#c084fc', '#ffffff'][Math.floor(Math.random() * 5)],
                        alpha: 1.0,
                        decay: 0.025 + Math.random() * 0.02,
                        shape: Math.random() < 0.4 ? 'star' : 'circle'
                    });
                }
            });

            // 2. Trigger staggered multi-spot fireworks bursts
            bursts.forEach(bst => {
                setTimeout(() => {
                    this.createFireworkBurst(bst.x, bst.y, bst.theme, 32);
                }, bst.delay);
            });

            // Cleanup after ~950ms when all fireworks and items have finished blooming and fading
            setTimeout(() => {
                this.reset(false);
                if (typeof callback === 'function') callback();
            }, 950);
        }

        reset(animated = true) {
            if (animated && this.items && this.items.length > 0) {
                this.explodeAndReset();
                return;
            }
            if (!this.world) return;
            const { World } = Matter;
            if (this.items.length) {
                World.remove(this.world, this.items);
                this.items = [];
            }
            this.particles = [];
            if (this.ctx && this.canvas) {
                this.ctx.save();
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.restore();
            }
            this.setupWalls();
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
    window.REAL_CANDY_GIFTS = REAL_CANDY_GIFTS;
    window.REAL_DIAMOND_GIFTS = REAL_DIAMOND_GIFTS;

})(typeof window !== 'undefined' ? window : this);
