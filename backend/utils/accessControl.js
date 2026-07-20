const mongoose = require('mongoose');

function isValidResourceId(value) {
    return mongoose.isObjectIdOrHexString(value);
}

function ownedResourceFilter(resourceId, userId, extra = {}) {
    return {
        _id: resourceId,
        userId,
        ...extra
    };
}

module.exports = {
    isValidResourceId,
    ownedResourceFilter
};
