const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ghzApp', {
  getConfig: () => ipcRenderer.invoke('app:get-config'),
  openSupport: () => ipcRenderer.invoke('app:open-support'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
  activateLicense: (payload) => ipcRenderer.invoke('license:activate', payload),
  validateLicense: () => ipcRenderer.invoke('license:validate'),
  getLicenseState: () => ipcRenderer.invoke('license:get-state'),
  getDeviceInfo: () => ipcRenderer.invoke('license:device-info'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close')
})

contextBridge.exposeInMainWorld('medvozApi', {
  getOpenAiStatus: () => ipcRenderer.invoke('ai:get-openai-status'),
  transcribeAudio: (payload) => ipcRenderer.invoke('ai:transcribe-audio', payload),
  classifyTranscript: (payload) => ipcRenderer.invoke('ai:classify-transcript', payload),
  generateClinicalDocument: (payload) => ipcRenderer.invoke('ai:generate-clinical-document', payload),
  analyzeClinicalQuality: (payload) => ipcRenderer.invoke('ai:analyze-clinical-quality', payload),
  exportPdf: (payload) => ipcRenderer.invoke('document:export-pdf', payload),
  printDocument: (payload) => ipcRenderer.invoke('document:print', payload)
})
