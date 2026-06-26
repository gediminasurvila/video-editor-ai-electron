import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import { IpcEvents, type RunCommandRequest, type RunCommandResponse } from '@shared/ipc'
import type { CommandName } from '@shared/commands'

/**
 * Bridges command invocations (from the MCP server or anywhere in the main
 * process) to the renderer, which owns the authoritative editor state. We send a
 * `command:run` event and resolve when the renderer replies with a matching
 * requestId. The renderer runs the same EditorCommands the UI uses, so an MCP
 * edit is indistinguishable from a human one and is captured in undo history.
 */
export class CommandBridge {
  private pending = new Map<
    string,
    { resolve: (r: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >()

  constructor(private getWebContents: () => WebContents | null) {}

  /** Called by the IPC layer when the renderer replies. */
  handleResponse(res: RunCommandResponse): void {
    const entry = this.pending.get(res.requestId)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(res.requestId)
    if (res.ok) entry.resolve(res.result)
    else entry.reject(new Error(res.error ?? 'Command failed'))
  }

  run(name: CommandName, args: unknown, timeoutMs = 30_000): Promise<unknown> {
    const wc = this.getWebContents()
    if (!wc) return Promise.reject(new Error('No active editor window'))

    const requestId = randomUUID()
    const req: RunCommandRequest = { requestId, name, args }

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Command "${name}" timed out`))
      }, timeoutMs)
      this.pending.set(requestId, { resolve, reject, timer })
      wc.send(IpcEvents.runCommand, req)
    })
  }
}
