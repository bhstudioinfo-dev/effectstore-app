require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function provisionAdmin() {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || '');
    const mongoUri = String(process.env.MONGODB_URI || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('ADMIN_EMAIL must be a valid email address.');
    }
    if (password.length < 12 || password.length > 128) {
        throw new Error('ADMIN_PASSWORD must contain between 12 and 128 characters.');
    }
    if (!mongoUri) {
        throw new Error('MONGODB_URI is required.');
    }

    await mongoose.connect(mongoUri);
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await User.findOne({ email });

    if (existing) {
        existing.password = passwordHash;
        existing.isAdmin = true;
        existing.isActive = true;
        await existing.save();
        console.log('Existing account was provisioned as admin.');
        return;
    }

    await User.create({
        email,
        password: passwordHash,
        name: 'Admin',
        phone: 'N/A',
        isAdmin: true,
        isActive: true
    });
    console.log('Admin account was provisioned.');
}

provisionAdmin()
    .catch((error) => {
        console.error(`Admin provisioning failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
