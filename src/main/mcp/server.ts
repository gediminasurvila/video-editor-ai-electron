import { createServer, type Server as HttpServer } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { commandSchemas, commandDescriptions, commandNames } from '@shared/commands'
import type { McpStatus } from '@shared/ipc'
import type { CommandBridge } from './bridge'

export const MCP_PORT = 19789
export const MCP_PATH = '/mcp'
export const MCP_URL = `http://127.0.0.1:${MCP_PORT}${MCP_PATH}`

/**
 * Local MCP server exposing every editor command as an MCP tool. External agents
 * (Claude Code, Cursor, Codex, Claude Desktop) connect here and drive the editor
 * through the exact same command layer the UI and in-app agent use.
 */
export class EditorMcpServer {
  private http: HttpServer | null = null
  private transport: StreamableHTTPServerTransport | null = null

  constructor(private bridge: CommandBridge) {}

  private buildServer(): McpServer {
    const server = new McpServer({ name: 'video-ai', version: '0.1.0' })

    for (const name of commandNames) {
      server.registerTool(
        name,
        {
          description: commandDescriptions[name],
          inputSchema: commandSchemas[name].shape
        },
        (async (args: unknown) => {
          const result = await this.bridge.run(name, args)
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(result ?? { ok: true }, null, 2) }
            ]
          }
        }) as never
      )
    }
    return server
  }

  async start(): Promise<McpStatus> {
    if (this.http) return this.status()

    const server = this.buildServer()
    this.transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(this.transport)

    this.http = createServer((req, res) => {
      if (!req.url?.startsWith(MCP_PATH)) {
        res.writeHead(404).end()
        return
      }
      this.transport!.handleRequest(req, res)
    })

    await new Promise<void>((resolve) => this.http!.listen(MCP_PORT, '127.0.0.1', resolve))
    return this.status()
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.http?.close(() => resolve()))
    this.http = null
    this.transport = null
  }

  status(): McpStatus {
    return { running: Boolean(this.http), url: MCP_URL, port: MCP_PORT }
  }
}
