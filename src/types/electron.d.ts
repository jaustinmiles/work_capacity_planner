declare module 'electron' {
  export const app: any
  export const BrowserWindow: any
  export const ipcMain: any
  export interface IpcMainInvokeEvent {
    sender: any
  }
  export * from 'electron/main'
}
