const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/effectstore');
    const oldId = new ObjectId('69c62ed2dad93ce88b9face4');
    const newId = new ObjectId('6a6c5a8186fab004b9faf48f');
    const usersCol = mongoose.connection.collection('users');
    const oldUser = await usersCol.findOne({ _id: oldId });
    if (oldUser) {
        await usersCol.deleteOne({ _id: oldId });
        oldUser._id = newId;
        oldUser.isAdmin = true;
        oldUser.subscription = 'studio';
        await usersCol.insertOne(oldUser);
        console.log('Admin user mirrored with new Cloud ID:', newId.toString());
    } else {
        await usersCol.updateOne(
            { _id: newId },
            { $set: { email: 'admin@effectstore.vn', isAdmin: true, subscription: 'studio', name: 'Admin' } },
            { upsert: true }
        );
        console.log('Admin user upserted with new Cloud ID:', newId.toString());
    }
    const layoutRes = await mongoose.connection.collection('giftmenulayouts').updateMany(
        { userId: oldId },
        { $set: { userId: newId } }
    );
    console.log('Updated layouts count:', layoutRes.modifiedCount);

    const mapRes = await mongoose.connection.collection('giftmappings').updateMany(
        { userId: oldId },
        { $set: { userId: newId } }
    );
    console.log('Updated mappings count:', mapRes.modifiedCount);
    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
