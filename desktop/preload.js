const { contextBridge, ipcRenderer } = require('electron');

const exposedChannels = new Set([
    'control-deck-trigger',
    'app-update:checking',
    'app-update:available',
    'app-update:not-available',
    'app-update:download-progress',
    'app-update:downloaded',
    'app-update:error'
]);

contextBridge.exposeInMainWorld('getMachineId', () => ipcRenderer.invoke('get-machine-id'));
contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, callback) => {
        if (!exposedChannels.has(channel) || typeof callback !== 'function') return () => {};
        const listener = (_event, ...args) => callback(...args);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
    },
    onControlDeckTrigger: (callback) => {
        const listener = (_event, slotId) => callback(slotId);
        ipcRenderer.on('control-deck-trigger', listener);
        return () => ipcRenderer.removeListener('control-deck-trigger', listener);
    }
});
