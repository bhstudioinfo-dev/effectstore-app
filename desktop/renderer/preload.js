const { contextBridge, ipcRenderer } = require('electron');

// Expose getMachineId to renderer
contextBridge.exposeInMainWorld('getMachineId', () => {
    return new Promise((resolve, reject) => {
        ipcRenderer.invoke('get-machine-id')
            .then(id => resolve(id))
            .catch(err => reject(err));
    });
});

// Expose other IPC methods if needed
contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});