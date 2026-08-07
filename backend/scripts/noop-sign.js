module.exports = async function noopSign() {
    // Fast custom signer bypass for electron-builder
    return true;
};
