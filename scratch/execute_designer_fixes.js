const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'desktop', 'renderer', 'js', 'gift-menu-designer.js');

let content = fs.readFileSync(file, 'utf8');

// 1. Add Thêm chữ button to top toolbar
const oldToolbarGroup = `<div class="gmd-group">
                            <button class="gmd-btn icon" data-action="undo" disabled><i class="fas fa-undo"></i></button>
                            <button class="gmd-btn icon" data-action="redo" disabled><i class="fas fa-redo"></i></button>
                            <button class="gmd-btn" data-action="help"><i class="far fa-question-circle"></i> Hướng dẫn</button>
                        </div>`;

const newToolbarGroup = `<div class="gmd-group">
                            <button class="gmd-btn icon" data-action="undo" disabled><i class="fas fa-undo"></i></button>
                            <button class="gmd-btn icon" data-action="redo" disabled><i class="fas fa-redo"></i></button>
                            <button class="gmd-btn" data-action="help"><i class="far fa-question-circle"></i> Hướng dẫn</button>
                            <button class="gmd-btn" id="gmd-add-text-btn"><i class="fas fa-font"></i> Thêm chữ</button>
                        </div>`;

if (content.includes(oldToolbarGroup)) {
    content = content.replace(oldToolbarGroup, newToolbarGroup);
    console.log('Successfully added Add Text button to top toolbar');
} else {
    console.warn('Could not locate oldToolbarGroup in gift-menu-designer.js');
}

// 2. Add keyboard hotkeys
const oldKeyupBlock = `            window.addEventListener('keyup', (e) => {
                if (e.code === 'Space') {
                    this.isSpacePressed = false;
                    const canvas = this.mount.querySelector('#gmd-canvas');
                    if (canvas) {
                        canvas.classList.remove('is-pan-mode');
                        canvas.classList.remove('is-panning');
                    }
                }
            });
        }`;

const newKeyupBlock = `            window.addEventListener('keyup', (e) => {
                if (e.code === 'Space') {
                    this.isSpacePressed = false;
                    const canvas = this.mount.querySelector('#gmd-canvas');
                    if (canvas) {
                        canvas.classList.remove('is-pan-mode');
                        canvas.classList.remove('is-panning');
                    }
                }
            });

            // Keyboard hotkeys for canvas operations
            window.addEventListener('keydown', (e) => {
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                if (activeTag === 'input' || activeTag === 'textarea') return;

                if (e.code === 'Delete' || e.code === 'Backspace') {
                    e.preventDefault();
                    this.deleteSelected();
                } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
                    e.preventDefault();
                    this.duplicateSelected();
                } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
                    e.preventDefault();
                    this.undo();
                } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
                    e.preventDefault();
                    this.redo();
                }
            });
        }`;

const normalizedContent = content.split('\r\n').join('\n');
const normalizedOldKeyup = oldKeyupBlock.split('\r\n').join('\n');
const normalizedNewKeyup = newKeyupBlock.split('\r\n').join('\n');

if (normalizedContent.includes(normalizedOldKeyup)) {
    content = normalizedContent.replace(normalizedOldKeyup, normalizedNewKeyup);
    console.log('Successfully added keyboard hotkeys event listener');
} else {
    console.warn('Could not locate keyboard keyup block in gift-menu-designer.js');
}

// 3. Append dormant templates to getDefaultTemplates()
const oldTemplatesEnd = `                            goals: [
                                { giftId: 'rose', giftName: 'Rose', current: 240, target: 500, icon: '/assets/gift-icons/Rose.png' },
                                { giftId: 'tiktok', giftName: 'TikTok', current: 45, target: 100, icon: '/assets/gift-icons/TikTok.png' },
                                { giftId: 'corgi', giftName: 'Corgi', current: 5, target: 15, icon: '/assets/gift-icons/Corgi.png' },
                                { giftId: 'sunglasses', giftName: 'Sunglasses', current: 2, target: 5, icon: '/assets/gift-icons/Sunglasses.png' }
                            ],
                            footerText: 'Cảm ơn mọi người đã ủng hộ! 💖'
                        }
                    ]
                }
            ];`;

const newTemplatesEnd = `                            goals: [
                                { giftId: 'rose', giftName: 'Rose', current: 240, target: 500, icon: '/assets/gift-icons/Rose.png' },
                                { giftId: 'tiktok', giftName: 'TikTok', current: 45, target: 100, icon: '/assets/gift-icons/TikTok.png' },
                                { giftId: 'corgi', giftName: 'Corgi', current: 5, target: 15, icon: '/assets/gift-icons/Corgi.png' },
                                { giftId: 'sunglasses', giftName: 'Sunglasses', current: 2, target: 5, icon: '/assets/gift-icons/Sunglasses.png' }
                            ],
                            footerText: 'Cảm ơn mọi người đã ủng hộ! 💖'
                        }
                    ]
                },
                {
                    id: 'tmpl_boss_challenge_gaming',
                    name: 'Thách đấu Boss 🐉',
                    tag: 'Boss HP',
                    category: 'boss-challenge',
                    tags: ['boss', 'challenge', 'gaming'],
                    isPremium: false,
                    layers: [
                        {
                            id: 'boss_challenge_widget',
                            name: '🐉 BOSS HP CHALLENGE',
                            type: 'boss-bar',
                            x: 90,
                            y: 800,
                            w: 900,
                            h: 160,
                            zIndex: 1,
                            visible: true,
                            locked: false,
                            giftId: 'rose',
                            giftName: 'Rose',
                            bossName: 'Hỏa Long Vương 🐉',
                            bossSub: 'Rose tấn công Boss!',
                            targetCount: 1000,
                            currentCount: 1000,
                            barColor: '#ef4444',
                            barHeight: 24,
                            barStyle: 'candy-stripe',
                            fontSize: 38,
                            subtitleFontSize: 26
                        }
                    ]
                },
                {
                    id: 'tmpl_lucky_mystery_box',
                    name: 'Lucky Mystery Box 🎁',
                    tag: 'Mystery Box',
                    category: 'mystery-box',
                    tags: ['lucky', 'mystery', 'box'],
                    isPremium: false,
                    layers: [
                        {
                            id: 'lucky_mystery_box_widget',
                            name: '🎁 MỞ KHÓA HỘP QUÀ KỲ BÍ',
                            type: 'mystery-chests',
                            x: 90,
                            y: 800,
                            w: 900,
                            h: 240,
                            zIndex: 1,
                            visible: true,
                            locked: false,
                            giftId: 'rose',
                            giftName: 'Rose',
                            targetCount: 500,
                            currentCount: 350,
                            subtitleText: 'Tích lũy Rose mở khóa hộp quà',
                            barColor: '#a855f7',
                            glowColor: '#fb7185',
                            barHeight: 24,
                            barStyle: 'glow-pulse',
                            fontSize: 32,
                            subtitleFontSize: 20
                        }
                    ]
                }
            ];`;

const normalizedOldTemplatesEnd = oldTemplatesEnd.split('\r\n').join('\n');
const normalizedNewTemplatesEnd = newTemplatesEnd.split('\r\n').join('\n');

const currentNormalized = content.split('\r\n').join('\n');

if (currentNormalized.includes(normalizedOldTemplatesEnd)) {
    content = currentNormalized.replace(normalizedOldTemplatesEnd, normalizedNewTemplatesEnd);
    console.log('Successfully appended dormant templates to getDefaultTemplates');
} else {
    console.warn('Could not locate oldTemplatesEnd block in gift-menu-designer.js');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Execution script completed');
