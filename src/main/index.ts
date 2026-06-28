import { join } from 'node:path'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { app, BrowserWindow, ipcMain, dialog, type WebContents } from 'electron'
import { IpcChannels, IpcEvents, type RunCommandResponse, type TranscriptWord } from '@shared/ipc'
import { probeMedia, generateThumbnails, extractAudio } from './ffmpeg/sidecar'
import { loadProject, saveProject } from './project/io'
import { exportSequence } from './export/render'
import { CommandBridge } from './mcp/bridge'
import { EditorMcpServer } from './mcp/server'
import type { Project } from '@shared/schema'

let mainWindow: BrowserWindow | null = null

const bridge = new CommandBridge(() => mainWindow?.webContents ?? null)
const mcp = new EditorMcpServer(bridge)

/** App icon for the window/taskbar (Linux & Windows dev; mac uses the bundle). */
function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0d0d10',
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IpcChannels.probeMedia, (_e, filePath: string) => probeMedia(filePath))

  ipcMain.handle(
    IpcChannels.thumbnails,
    (_e, filePath: string, duration: number, count: number, height: number) =>
      generateThumbnails(filePath, duration, count, height)
  )

  ipcMain.handle(IpcChannels.readMediaBytes, async (_e, filePath: string) => {
    const buf = await readFile(filePath)
    // Return the underlying ArrayBuffer slice so it transfers as bytes.
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle(IpcChannels.openMediaDialog, async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      filters: [
        { name: 'Media', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'mp3', 'wav', 'aac'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle(IpcChannels.openProjectDialog, async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      filters: [{ name: 'Video AI Project', extensions: ['aivp'] }],
      properties: ['openFile']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle(IpcChannels.saveProjectDialog, async () => {
    const r = await dialog.showSaveDialog(mainWindow!, {
      filters: [{ name: 'Video AI Project', extensions: ['aivp'] }]
    })
    return r.canceled ? null : r.filePath
  })

  ipcMain.handle(IpcChannels.exportDialog, async (_e, defaultName: string) => {
    const r = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export video',
      defaultPath: defaultName,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    })
    return r.canceled ? null : r.filePath
  })

  ipcMain.handle(IpcChannels.loadProject, (_e, path: string) => loadProject(path))
  ipcMain.handle(IpcChannels.saveProject, (_e, path: string, project: Project) =>
    saveProject(path, project)
  )

  ipcMain.handle(
    IpcChannels.exportSequence,
    (
      _e,
      project: Project,
      sequenceId: string,
      outPath: string,
      titlePngs: Record<string, string>
    ) =>
      exportSequence(project, sequenceId, outPath, titlePngs ?? {}, (line) =>
        mainWindow?.webContents.send('export:progress', line)
      )
  )

  ipcMain.handle(IpcChannels.mcpStatus, () => mcp.status())

  ipcMain.handle(
    IpcChannels.transcribeMedia,
    async (_e, filePath: string, apiKey: string): Promise<TranscriptWord[]> => {
      const wavPath = join(tmpdir(), `video-ai-transcript-${Date.now()}.wav`)
      try {
        await extractAudio(filePath, wavPath)
        const wavBytes = await readFile(wavPath)
        const formData = new FormData()
        formData.append('file', new File([wavBytes], 'audio.wav', { type: 'audio/wav' }))
        formData.append('model', 'whisper-1')
        formData.append('response_format', 'verbose_json')
        formData.append('timestamp_granularities[]', 'word')
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData
        })
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`Whisper API error ${response.status}: ${body}`)
        }
        const data = (await response.json()) as { words?: TranscriptWord[] }
        return data.words ?? []
      } finally {
        await unlink(wavPath).catch(() => undefined)
      }
    }
  )

  // Renderer replies to a command:run event forwarded from the MCP bridge.
  ipcMain.on(IpcEvents.runCommand + ':response', (_e, res: RunCommandResponse) =>
    bridge.handleResponse(res)
  )
}

app.whenReady().then(async () => {
  registerIpc()
  createWindow()
  try {
    const status = await mcp.start()
    mainWindow?.webContents.on('did-finish-load', () =>
      mainWindow?.webContents.send(IpcEvents.mcpStatusChanged, status)
    )
  } catch (err) {
    console.error('Failed to start MCP server:', err)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await mcp.stop()
  if (process.platform !== 'darwin') app.quit()
})

export type { WebContents }
