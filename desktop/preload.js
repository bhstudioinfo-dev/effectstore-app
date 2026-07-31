const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('getMachineId', () => ipcRenderer.invoke('get-machine-id'));
contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    onControlDeckTrigger: (callback) => {
        const listener = (_event, slotId) => callback(slotId);
        ipcRenderer.on('control-deck-trigger', listener);
        return () => ipcRenderer.removeListener('control-deck-trigger', listener);
    }
});
