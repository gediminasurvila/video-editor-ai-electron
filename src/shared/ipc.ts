import type { MediaItem, Project } from './schema'
import type { CommandName } from './commands'

/** Channels invoked renderer → main (request/response via ipcRenderer.invoke). */
export const IpcChannels = {
  probeMedia: 'media:probe',
  readMediaBytes: 'media:readBytes',
  openMediaDialog: 'media:openDialog',
  openProjectDialog: 'project:openDialog',
  saveProjectDialog: 'project:saveDialog',
  loadProject: 'project:load',
  saveProject: 'project:save',
  exportDialog: 'export:dialog',
  exportSequence: 'export:run',
  mcpStatus: 'mcp:status'
} as const

/** Channels pushed main → renderer (mainWindow.webContents.send). */
export const IpcEvents = {
  /** The MCP server received a tool call and wants the renderer to run a command. */
  runCommand: 'command:run',
  mcpStatusChanged: 'mcp:statusChanged'
} as const

export interface ProbeResult {
  media: Omit<MediaItem, 'id' | 'name'>
}

export interface ExportRequest {
  /** Pre-rendered frame PNGs / raw stream are produced by the renderer; for the
   *  MVP the main process re-encodes from the source using an edit decision list. */
  project: Project
  sequenceId: string
  outPath: string
}

export interface RunCommandRequest {
  requestId: string
  name: CommandName
  args: unknown
}

export interface RunCommandResponse {
  requestId: string
  ok: boolean
  result?: unknown
  error?: string
}

export interface McpStatus {
  running: boolean
  url: string
  port: number
}
