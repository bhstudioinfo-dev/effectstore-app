(function () {
    const baseContracts = {
        gift: {
            type: 'gift',
            defaults: {
                width: 84,
                height: 84,
                rotation: 0,
                showName: true,
                textSize: 13,
                textColor: '#f7cb64',
                textGap: 4,
                textPosition: 'bottom',
                textAlign: 'center',
                subtext: '',
                showTextBg: false,
                textBgStyle: 'classic',
                textBgColor: '#000000',
                iconDisplayMode: 'media',
                iconText: '',
                iconTextColor: '#ffffff',
                iconTextSize: 20,
                lockRatio: true,
                auraType: 'None',
                auraColor: '#d7b2ff',
                auraShape: 'Circle',
                animationType: 'None',
                animationSpeed: 1,
                auraSpeed: 1,
                auraScale: 1,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'layers'],
            renderContract: {
                family: 'gift',
                previewBranch: 'standard-gift',
                overlayBranch: 'standard-gift',
                supportsRotation: true,
                supportsResize: true,
                usesScaledWrapper: false
            },
            exportContract: {
                coordinateSource: 'stage',
                scalesPositionFromSafeArea: true,
                scalesText: true,
                preservesNestedChildren: false
            }
        },
        text: {
            type: 'text',
            defaults: {
                text: 'Nhap van ban',
                w: 600,
                h: 120,
                color: '#ffffff',
                fontSize: 36,
                fontWeight: 'bold',
                textShadow: 'none',
                textAlign: 'center',
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'layers'],
            renderContract: {
                family: 'widget',
                previewBranch: 'widget-text',
                overlayBranch: 'widget-text',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 900, height: 160 }
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                scalesText: true,
                preservesNestedChildren: false
            }
        },
        'media-asset': {
            type: 'media-asset',
            defaults: {
                w: 360,
                h: 360,
                opacity: 1,
                fitMode: 'contain',
                autoplay: true,
                loop: true,
                muted: true,
                playsinline: true,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'layers'],
            renderContract: {
                family: 'widget',
                previewBranch: 'widget-media-asset',
                overlayBranch: 'widget-media-asset',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 900, height: 160 }
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                scalesText: false,
                preservesNestedChildren: false
            }
        },
        'goal-bar': {
            type: 'goal-bar',
            defaults: {
                w: 900,
                h: 160,
                targetCount: 100,
                currentCount: 0,
                barColor: '#ff007f',
                glowColor: 'rgba(255,0,127,0.5)',
                borderRadius: 12,
                barHeight: 54,
                barStyle: 'solid',
                fontSize: 38,
                subtitleFontSize: 24,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'data', 'test', 'layers'],
            renderContract: {
                family: 'goal-widget',
                previewBranch: 'widget-goal-bar',
                overlayBranch: 'widget-goal-bar',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 900, height: 160 }
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                scalesProgressData: false,
                preservesNestedChildren: false
            }
        },
        'goal-circle': {
            type: 'goal-circle',
            defaults: {
                w: 280,
                h: 320,
                targetCount: 100,
                currentCount: 0,
                centerIcon: 'gift-icon',
                barColor: '#ff007f',
                fontSize: 24,
                subtitleFontSize: 16,
                numberFontSize: 16,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'data', 'test', 'layers'],
            renderContract: {
                family: 'goal-widget',
                previewBranch: 'widget-goal-circle',
                overlayBranch: 'widget-goal-circle',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 280, height: 320 }
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                scalesProgressData: false,
                preservesNestedChildren: false
            }
        },
        'boss-bar': {
            type: 'boss-bar',
            defaults: {
                w: 840,
                h: 180,
                targetCount: 100,
                currentCount: 0,
                bossName: 'BOSS HP',
                barColor: '#ef4444',
                barHeight: 24,
                barStyle: 'solid',
                fontSize: 38,
                subtitleFontSize: 26,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'data', 'test', 'layers'],
            renderContract: {
                family: 'goal-widget',
                previewBranch: 'widget-boss-bar',
                overlayBranch: 'widget-boss-bar',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 840, height: 180 }
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                scalesProgressData: false,
                preservesNestedChildren: false
            }
        },
        combo: {
            type: 'combo',
            defaults: {
                w: 800,
                h: 220,
                comboCount: 0,
                barColor: '#ef4444',
                fontSize: 40,
                numberFontSize: 64,
                subtitleFontSize: 20,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'data', 'test', 'layers'],
            renderContract: {
                family: 'goal-widget',
                previewBranch: 'widget-combo',
                overlayBranch: 'widget-combo',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 800, height: 220 }
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                scalesProgressData: false,
                preservesNestedChildren: false
            }
        },
        'mystery-chests': {
            type: 'mystery-chests',
            defaults: {
                w: 900,
                h: 240,
                targetCount: 100,
                currentCount: 0,
                barColor: '#a855f7',
                glowColor: '#fb7185',
                barHeight: 24,
                barStyle: 'solid',
                fontSize: 32,
                subtitleFontSize: 20,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'data', 'test', 'layers'],
            renderContract: {
                family: 'goal-widget',
                previewBranch: 'widget-mystery-chests',
                overlayBranch: 'widget-mystery-chests',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 900, height: 240 },
                milestones: [25, 50, 75, 100]
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                scalesProgressData: false,
                preservesNestedChildren: false
            }
        },
        'top-contributors': {
            type: 'top-contributors',
            defaults: {
                w: 900,
                h: 560,
                contributors: [],
                limitCount: 3,
                showAvatar: true,
                showValue: true,
                barColor: '#eab308',
                fontSize: 34,
                rowFontSize: 30,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'data', 'test', 'layers'],
            renderContract: {
                family: 'leaderboard-widget',
                previewBranch: 'widget-top-contributors',
                overlayBranch: 'widget-top-contributors',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 900, height: 560 }
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                preservesNestedChildren: false
            }
        },
        'podium-contributors': {
            type: 'podium-contributors',
            defaults: {
                w: 900,
                h: 560,
                contributors: [],
                showValue: true,
                barColor: '#eab308',
                fontSize: 34,
                rowFontSize: 22,
                valueFontSize: 22,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'data', 'test', 'layers'],
            renderContract: {
                family: 'leaderboard-widget',
                previewBranch: 'widget-podium-contributors',
                overlayBranch: 'widget-podium-contributors',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 900, height: 560 }
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                preservesNestedChildren: false
            }
        },
        'goal-list': {
            type: 'goal-list',
            defaults: {
                w: 900,
                h: 700,
                goals: [],
                footerText: '',
                showGiftName: true,
                iconSize: 28,
                barHeight: 12,
                barStyle: 'solid',
                autoScroll: false,
                autoScrollSpeed: 15,
                shimmerEffect: true,
                fontSize: 32,
                rowFontSize: 22,
                footerFontSize: 20,
                barColor: '#ff007f',
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'data', 'test', 'layers'],
            renderContract: {
                family: 'goal-widget',
                previewBranch: 'widget-goal-list',
                overlayBranch: 'widget-goal-list',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: true,
                defaultRefSize: { width: 900, height: 700 },
                supportsVerticalAutoScroll: true
            },
            exportContract: {
                coordinateSource: 'stage-and-logical',
                scalesPositionFromSafeArea: true,
                preservesNestedChildren: true
            }
        },
        'gift-stack-group': {
            type: 'gift-stack-group',
            defaults: {
                name: 'Nhom qua',
                children: [],
                layoutDirection: 'vertical',
                gap: 10,
                iconSize: 64,
                textSize: 14,
                textPosition: 'bottom',
                textGap: 4,
                textColor: '#ffffff',
                showName: true,
                showPanel: true,
                showBorder: true,
                panelColor: '#0a0a14',
                panelFillType: 'solid',
                panelGradientFrom: '#3b1f48',
                panelGradientTo: '#0a0a14',
                panelGradientAngle: 135,
                panelEffect: 'none',
                panelEffectSpeed: 3,
                panelGlowIntensity: 0.35,
                borderColor: '#22d3ee',
                borderFillType: 'solid',
                borderGradientFrom: '#22d3ee',
                borderGradientTo: '#a855f7',
                borderGradientAngle: 135,
                borderEffect: 'none',
                borderEffectSpeed: 2,
                borderGlowIntensity: 0.55,
                loopEnabled: false,
                loopDirection: 'vertical',
                loopSpeed: 15,
                visible: true,
                locked: false
            },
            inspectorTabs: ['basic', 'advanced', 'layers'],
            renderContract: {
                family: 'group-widget',
                previewBranch: 'widget-gift-stack-group',
                overlayBranch: 'widget-gift-stack-group',
                supportsRotation: false,
                supportsResize: true,
                usesScaledWrapper: false,
                rendersNestedChildren: true,
                supportsLoop: true
            },
            exportContract: {
                coordinateSource: 'stage',
                scalesPositionFromSafeArea: true,
                preservesNestedChildren: true
            }
        }
    };

    const registry = Object.freeze(Object.keys(baseContracts).reduce((acc, key) => {
        acc[key] = Object.freeze({
            ...baseContracts[key],
            defaults: Object.freeze({ ...baseContracts[key].defaults }),
            inspectorTabs: Object.freeze([...(baseContracts[key].inspectorTabs || [])]),
            renderContract: Object.freeze({ ...baseContracts[key].renderContract }),
            exportContract: Object.freeze({ ...baseContracts[key].exportContract })
        });
        return acc;
    }, {}));

    const api = {
        types: Object.freeze(Object.keys(registry)),
        all() {
            return registry;
        },
        normalizeType(type) {
            return type || 'gift';
        },
        get(type) {
            return registry[this.normalizeType(type)] || null;
        },
        isKnown(type) {
            return Boolean(this.get(type));
        },
        isWidget(type) {
            const contract = this.get(type);
            return Boolean(contract && contract.renderContract.family !== 'gift');
        },
        getDefaultRefSize(type, fallback = { width: 900, height: 160 }) {
            const contract = this.get(type);
            return (contract && contract.renderContract.defaultRefSize) || fallback;
        }
    };

    window.MenuDesignerItemRegistry = Object.freeze(api);
})();
