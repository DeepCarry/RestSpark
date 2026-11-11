import { contextBridge, ipcRenderer } from 'electron'
import { exposeI18next } from './utils/context-bridge-exposers.js'

exposeI18next()
contextBridge.exposeInMainWorld('popover', {
  read: () => ipcRenderer.invoke('popover-read'),
  action: (type, choice) => ipcRenderer.invoke('popover-action', type, choice),
  onVisibility: callback => ipcRenderer.on('popover-visibility', (_event, visible) => callback(visible))
})
