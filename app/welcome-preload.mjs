import { contextBridge, ipcRenderer } from 'electron'
import { exposeI18next, exposeSettings } from './utils/context-bridge-exposers.js'

exposeI18next()
exposeSettings()
contextBridge.exposeInMainWorld('onboarding', {
  isPreview: () => ipcRenderer.invoke('onboarding-is-preview'),
  complete: (preset, preferences) => ipcRenderer.invoke('complete-onboarding', preset, preferences)
})
