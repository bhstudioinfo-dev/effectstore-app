const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('getMachineId', () => ipcRenderer.invoke('get-machine-id'));
contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
