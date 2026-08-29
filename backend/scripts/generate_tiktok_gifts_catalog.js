const fs = require('fs');
const path = require('path');
const { TikTokLiveConnection } = require('tiktok-live-connector');

// Additional manual mapping for classic/event gifts that are in local assets but not in active live API
const MANUAL_OVERRIDES = {
    'rose': { id: '5655', name: 'Rose', diamondCount: 1, coins: 1 },
    'tiktok': { id: '5269', name: 'TikTok', diamondCount: 1, coins: 1 },
    'ice_cream': { id: 'ice_cream', name: 'Ice Cream', diamondCount: 5, coins: 5 },
    'ice_cream_cone': { id: '5827', name: 'Ice Cream Cone', diamondCount: 5, coins: 5 },
    'finger_heart': { id: '5487', name: 'Finger Heart', diamondCount: 5, coins: 5 },
    'heart': { id: '5487', name: 'Heart', diamondCount: 10, coins: 10 },
    'heart_me': { id: '5879', name: 'Heart Me', diamondCount: 1, coins: 1 },
    'corgi': { id: '6064', name: 'Corgi', diamondCount: 50, coins: 50 },
    'doughnut': { id: '5650', name: 'Doughnut', diamondCount: 30, coins: 30 },
    'perfume': { id: '5660', name: 'Perfume', diamondCount: 20, coins: 20 },
    'sunglasses': { id: '5828', name: 'Sunglasses', diamondCount: 50, coins: 50 },
    'money_gun': { id: '5659', name: 'Money Gun', diamondCount: 500, coins: 500 },
    'pk_crown': { id: 'pk_crown', name: 'PK Crown', diamondCount: 1000, coins: 1000 },
    'pk_crown_ring': { id: 'pk_crown_ring', name: 'PK Crown Ring', diamondCount: 1000, coins: 1000 },
    'friendship_necklace': { id: 'friendship_necklace', name: 'Friendship Necklace', diamondCount: 299, coins: 299 },
    'wooly_hat': { id: 'wooly_hat', name: 'Wooly Hat', diamondCount: 99, coins: 99 },
    'boxing_gloves': { id: 'boxing_gloves', name: 'Boxing Gloves', diamondCount: 299, coins: 299 },
    'love_you': { id: 'love_you', name: 'Love You', diamondCount: 520, coins: 520 },
    'love_you_so_much': { id: 'love_you_so_much', name: 'Love You So Much', diamondCount: 520, coins: 520 },
    'youre_awesome': { id: 'youre_awesome', name: "You're Awesome", diamondCount: 88, coins: 88 },
    'rosa': { id: 'rosa', name: 'Rosa', diamondCount: 1, coins: 1 },
    'giraffe': { id: '11491', name: 'Giraffe', diamondCount: 1000, coins: 1000 },
    '11491': { id: '11491', name: 'Giraffe', diamondCount: 1000, coins: 1000 },
    'diamond_gun': { id: '11473', name: 'Diamond Gun', diamondCount: 5000, coins: 5000 },
    '134381': { id: '134381', name: 'Diamond Gun', diamondCount: 5000, coins: 5000 },
    'demon_hunter': { id: '867046', name: 'Demon Hunter', diamondCount: 1000, coins: 1000 },
    '867046': { id: '867046', name: 'Demon Hunter', diamondCount: 1000, coins: 1000 },
    'eye_on_the_ball': { id: '230707', name: 'Eye on the Ball', diamondCount: 100, coins: 100 },
    '230707': { id: '230707', name: 'Eye on the Ball', diamondCount: 100, coins: 100 },
    'steady_on_the_beam': { id: '230709', name: 'Steady on the Beam', diamondCount: 100, coins: 100 },
    '230709': { id: '230709', name: 'Steady on the Beam', diamondCount: 100, coins: 100 },
    'bruiser': { id: '127096', name: 'Bruiser', diamondCount: 10, coins: 10 },
    '127096': { id: '127096', name: 'Bruiser', diamondCount: 10, coins: 10 },
    'cursed_kick': { id: '127090', name: 'Cursed Kick', diamondCount: 10, coins: 10 },
    '127090': { id: '127090', name: 'Cursed Kick', diamondCount: 10, coins: 10 },
    'single_strike': { id: '127088', name: 'Single Strike', diamondCount: 10, coins: 10 },
    '127088': { id: '127088', name: 'Single Strike', diamondCount: 10, coins: 10 },
    'stabilizer': { id: '127098', name: 'Stabilizer', diamondCount: 10, coins: 10 },
    '127098': { id: '127098', name: 'Stabilizer', diamondCount: 10, coins: 10 },
    'triple_thunder': { id: '127089', name: 'Triple Thunder', diamondCount: 10, coins: 10 },
    '127089': { id: '127089', name: 'Triple Thunder', diamondCount: 10, coins: 10 },
    'wobbler': { id: '127094', name: 'Wobbler', diamondCount: 10, coins: 10 },
    '127094': { id: '127094', name: 'Wobbler', diamondCount: 10, coins: 10 }
};

async function buildCatalog() {
    console.log('🔄 Fetching TikTok Live gifts catalog from official API...');
    const catalog = {};
    
    try {
        const conn = new TikTokLiveConnection('tiktok');
        const gifts = await conn.fetchAvailableGifts();
        console.log(`✅ Successfully fetched ${gifts.length} gifts from TikTok Live API`);
        
        for (const g of gifts) {
            const id = String(g.id);
            const name = String(g.name || '').trim();
            const diamondCount = Number(g.diamond_count || 0);
            const iconUrl = g.icon?.url_list?.[0] || g.image?.url_list?.[0] || '';
            
            const entry = {
                id,
                name,
                diamondCount,
                coins: diamondCount,
                iconUrl
            };
            
            catalog[id] = entry;
            const normName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normName) {
                catalog[`name_${normName}`] = entry;
            }
        }
    } catch (err) {
        console.warn('⚠️ Could not fetch live TikTok gifts:', err.message);
    }
    
    // Merge manual overrides
    for (const [key, val] of Object.entries(MANUAL_OVERRIDES)) {
        catalog[key] = { ...val, iconUrl: val.iconUrl || '' };
        catalog[val.id] = { ...val, iconUrl: val.iconUrl || '' };
        const normName = val.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normName) {
            catalog[`name_${normName}`] = { ...val, iconUrl: val.iconUrl || '' };
        }
    }
    
    const outputPath = path.join(__dirname, '..', 'config', 'tiktok_gifts_catalog.json');
    fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`💾 Catalog written to: ${outputPath} (${Object.keys(catalog).length} entries)`);
    return catalog;
}

if (require.main === module) {
    buildCatalog().then(() => {
        console.log('Done!');
        process.exit(0);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { buildCatalog };
