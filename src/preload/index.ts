import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IpcChannels, IpcEvents } from '@shared/ipc'
import type { ProbeResult, RunCommandRequest, RunCommandResponse, McpStatus, TranscriptWord } from '@shared/ipc'
import type { Project } from '@shared/schema'

/**
 * The single, typed surface the renderer is allowed to touch. Everything the UI
 * needs from the main process goes through here; nothing else is exposed.
 */
const api = {
  probeMedia: (filePath: string): Promise<ProbeResult> =>
    ipcRenderer.invoke(IpcChannels.probeMedia, filePath),
  readMediaBytes: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke(IpcChannels.readMediaBytes, filePath),
  thumbnails: (filePath: string, duration: number, count: number, height: number): Promise<string[]> =>
    ipcRenderer.invoke(IpcChannels.thumbnails, filePath, duration, count, height),

  openMediaDialog: (): Promise<string[]> => ipcRenderer.invoke(IpcChannels.openMediaDialog),
  openFolderDialog: (): Promise<string[]> => ipcRenderer.invoke(IpcChannels.openFolderDialog),
  /** Resolve the absolute path of a File dropped onto the window. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  openProjectDialog: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.openProjectDialog),
  saveProjectDialog: (): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.saveProjectDialog),
  loadProject: (path: string): Promise<Project> => ipcRenderer.invoke(IpcChannels.loadProject, path),
  saveProject: (path: string, project: Project): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.saveProject, path, project),
  exportDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.exportDialog, defaultName),

  exportSequence: (
    project: Project,
    sequenceId: string,
    outPath: string,
    titlePngs: Record<string, string>
  ): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.exportSequence, project, sequenceId, outPath, titlePngs),

  mcpStatus: (): Promise<McpStatus> => ipcRenderer.invoke(IpcChannels.mcpStatus),
  onMcpStatusChanged: (cb: (status: McpStatus) => void): (() => void) => {
    const listener = (_e: unknown, status: McpStatus): void => cb(status)
    ipcRenderer.on(IpcEvents.mcpStatusChanged, listener)
    return () => ipcRenderer.removeListener(IpcEvents.mcpStatusChanged, listener)
  },

  // Command bridge: main asks the renderer to run a command; renderer replies.
  onRunCommand: (handler: (req: RunCommandRequest) => Promise<RunCommandResponse>): void => {
    ipcRenderer.on(IpcEvents.runCommand, async (_e, req: RunCommandRequest) => {
      const res = await handler(req)
      ipcRenderer.send(IpcEvents.runCommand + ':response', res)
    })
  },

  transcribeMedia: (filePath: string, apiKey: string, language?: string): Promise<TranscriptWord[]> =>
    ipcRenderer.invoke(IpcChannels.transcribeMedia, filePath, apiKey, language),

  onExportProgress: (cb: (line: string) => void): (() => void) => {
    const listener = (_e: unknown, line: string): void => cb(line)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type AppApi = typeof api
