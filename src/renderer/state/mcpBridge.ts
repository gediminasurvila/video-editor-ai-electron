import { runCommand } from '../commands'
import type { CommandName } from '@shared/commands'

/**
 * Register the renderer as the executor for commands forwarded by the MCP server
 * (and any other main-process caller). External agents hit the MCP server in
 * main; main forwards here; we run the command against the live editor state and
 * reply. Call once at app startup.
 */
export function registerCommandBridge(): void {
  window.api.onRunCommand(async (req) => {
    try {
      const result = await runCommand(req.name as CommandName, req.args)
      return { requestId: req.requestId, ok: true, result }
    } catch (err) {
      return {
        requestId: req.requestId,
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })
}
