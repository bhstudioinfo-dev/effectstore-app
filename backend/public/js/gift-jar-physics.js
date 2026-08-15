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
            if (window.location && window.location.protocol === 'file:') {
                return `assets/${subfolder}/${clean.replace(/^assets\/(gift-icons|candies|diamonds)\//, '')}`;
            }
            return `/assets/${subfolder}/${clean.replace(/^assets\/(gift-icons|candies|diamonds)\//, '')}`;
        }

        preloadAllAssets() {
            this.loadImage('hu-thuong', this.getAssetUrl('jars', 'hu-thuong.png'));
            this.loadImage('hu-thuong-2', this.getAssetUrl('jars', 'hu-thuong-2.png'));
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
            const spawnX = mouthCenterX + (Math.random() - 0.5) * (jar.w * 0.15);
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

        spawnTopDonorBadge(rank = 1, nickname = 'Top Fan') {
            const numRank = Number(rank) || 1;
            const radius = numRank === 1 ? 21 : (numRank <= 3 ? 19 : 17);
            this.spawnGiftBody('top_donor', radius, {
                rank: numRank,
                nickname: nickname || `Top ${numRank}`
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
                this.drawTintedImage(backImg, jar.x, jar.y, jar.w, jar.h, jarColor, 0.50);
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

                if (type === 'top_donor') {
                    const rank = Number(data.rank) || 1;
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);

                    const grad = ctx.createLinearGradient(-r, -r, r, r);
                    let ringColor = '#fbbf24';
                    let badgeLabel = `👑 #${rank}`;

                    if (rank === 1) {
                        grad.addColorStop(0, '#fef08a');
                        grad.addColorStop(0.5, '#f59e0b');
                        grad.addColorStop(1, '#b45309');
                        ringColor = '#fbbf24';
                        badgeLabel = '👑 #1';
                    } else if (rank === 2) {
                        grad.addColorStop(0, '#ffffff');
                        grad.addColorStop(0.5, '#cbd5e1');
                        grad.addColorStop(1, '#64748b');
                        ringColor = '#e2e8f0';
                        badgeLabel = '🥈 #2';
                    } else if (rank === 3) {
                        grad.addColorStop(0, '#ffedd5');
                        grad.addColorStop(0.5, '#f97316');
                        grad.addColorStop(1, '#9a3412');
                        ringColor = '#fdba74';
                        badgeLabel = '🥉 #3';
                    } else if (rank === 4) {
                        grad.addColorStop(0, '#fae8ff');
                        grad.addColorStop(0.5, '#c084fc');
                        grad.addColorStop(1, '#7e22ce');
                        ringColor = '#e879f9';
                        badgeLabel = '💎 #4';
                    } else {
                        grad.addColorStop(0, '#ecfeff');
                        grad.addColorStop(0.5, '#22d3ee');
                        grad.addColorStop(1, '#0e7490');
                        ringColor = '#67e8f9';
                        badgeLabel = '💎 #5';
                    }

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
                    ctx.fillText(badgeLabel, 0, 1);
                    ctx.shadowBlur = 0;
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

        reset() {
            if (!this.world) return;
            const { World } = Matter;
            if (this.items.length) {
                World.remove(this.world, this.items);
                this.items = [];
            }
            if (this.ctx && this.canvas) {
                this.ctx.save();
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.restore();
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
    window.REAL_CANDY_GIFTS = REAL_CANDY_GIFTS;
    window.REAL_DIAMOND_GIFTS = REAL_DIAMOND_GIFTS;

})(typeof window !== 'undefined' ? window : this);
