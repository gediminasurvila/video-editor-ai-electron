<div align="center">

# Video AI

**The cross-platform video editor built for AI.**

A desktop video editor (macOS · Windows · Linux) where a built-in AI agent — or any external agent over MCP — edits your timeline through the exact same commands you do.

</div>

---

## Table of contents

- [What it is](#what-it-is)
- [Highlights](#highlights)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Setup](#setup)
- [Running in development](#running-in-development)
- [Using the editor](#using-the-editor)
- [Using the in-app agent](#using-the-in-app-agent)
- [Connecting an external agent over MCP](#connecting-an-external-agent-over-mcp)
- [Packaging desktop builds](#packaging-desktop-builds)
- [Project file format](#project-file-format)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

---

## What it is

Video AI is an Electron + React timeline editor inspired by [palmier-pro](https://github.com/palmier-io/palmier-pro), rebuilt to run on **all desktop platforms** and to put AI at the center. Its defining idea is **one command layer, three callers**: the UI, the in-app agent, and a local MCP server all drive the editor through a single typed, validated set of commands. Every edit — human or AI — is identical and fully undoable.

## Highlights

- 🎬 **Real timeline editing** — multi-track timeline, import, place, split, trim, move, transform, delete.
- 🖥️ **WebCodecs + WebGL preview** — GPU-accelerated decode and compositing in the renderer; no per-OS native engine.
- 🤖 **In-app agent** — chat that edits your project directly (pluggable provider, Claude by default).
- 🔌 **MCP server** — external agents (Claude Code, Cursor, Codex, Claude Desktop) connect to `http://127.0.0.1:19789/mcp` and use the same tools.
- 📦 **Cross-platform** — packaged as `.dmg` (macOS), NSIS installer (Windows), and AppImage/`.deb` (Linux).
- ↩️ **Undo/redo everywhere** — AI changes go through history just like manual ones.

## Architecture

```
Renderer (React)                          Main (Node/Electron)
┌──────────────────────────────┐         ┌──────────────────────────────┐
│ Panels: Media · Timeline ·    │  IPC    │ FFmpeg/ffprobe sidecar        │
│ Preview · Inspector · Agent   │ ◄─────► │ .aivp project I/O             │
│                               │         │ MCP server :19789  ◄── agents │
│ Zustand store (+ undo/redo)   │         └──────────────────────────────┘
│ EditorCommands  ◄─── the one shared command/tool layer ───┐
│ Engine: WebCodecs decode →    │                           │
│ WebGL compositor → canvas     │      in-app agent ────────┘
└──────────────────────────────┘
```

| Layer | Tech |
| --- | --- |
| Shell / build | Electron · electron-vite · electron-builder |
| Renderer | React · TypeScript · Zustand |
| Preview engine | WebCodecs · WebGL2 · mp4box.js |
| Media probe / export | bundled FFmpeg sidecar |
| AI | `@modelcontextprotocol/sdk` · `@anthropic-ai/sdk` (pluggable) |
| Validation | zod (schemas shared across IPC, files, and tools) |

Source map:

```
src/
├─ shared/        schema.ts (project model) · commands.ts (tool registry) · ipc.ts
├─ main/          index.ts · ffmpeg/ · project/ · export/ · mcp/
├─ preload/       typed contextBridge surface
└─ renderer/
   ├─ commands/   EditorCommands handlers (the shared tool layer)
   ├─ state/      Zustand store + undo/redo · settings
   ├─ engine/     decode/ (mp4box + WebCodecs) · compositor/ (WebGL2)
   ├─ panels/     Toolbar · MediaPanel · Preview · Inspector · Timeline · AgentChat
   └─ ai/         providers/ (Claude default) · agent/ (loop + tool defs)
```

## Requirements

- **Node.js ≥ 20** (Node 22 recommended) and npm.
- **FFmpeg** and **ffprobe** available on your `PATH` for development (used for media import probing and export). Packaged builds bundle their own binaries.
  - macOS: `brew install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg` (or [ffmpeg.org](https://ffmpeg.org/download.html))
  - Linux: `sudo apt install ffmpeg`
- A GPU/driver capable of WebGL2 (any modern desktop). Headless/VM environments may need software rendering — see [Troubleshooting](#troubleshooting).
- An **Anthropic API key** if you want to use the in-app agent (bring your own key).

## Setup

```bash
git clone git@github.com:gediminasurvila/video-editor-ai-electron.git
cd video-editor-ai-electron
npm install
```

Verify your toolchain:

```bash
ffmpeg -version    # should print a version
npm run typecheck  # should pass
npm test           # should pass
```

## Running in development

```bash
npm run dev
```

This launches the app with hot-reload for the renderer. The MCP server starts automatically on `http://127.0.0.1:19789/mcp` (its status is shown in the top-right of the toolbar).

## Using the editor

1. **Create a sequence** — click **+ Sequence** in the toolbar. This adds one video and one audio track and makes the sequence active.
2. **Import media** — in the **Media** panel (left), click **Import** and choose video/audio files.
3. **Add to timeline** — double-click a media item to append it to the video track (or use the agent).
4. **Edit** — on the **Timeline** (bottom):
   - Click a clip to select it.
   - Click the ruler to move the **playhead**.
   - **Split at playhead** razors the selected clip.
   - **+ Video / + Audio** add tracks.
5. **Adjust properties** — select a clip and open the **Inspector** tab (right) to change position, scale, rotation, and opacity.
6. **Preview** — press **▶** to play; the WebGL engine composites the active frame on the canvas.
7. **Save / Open** — toolbar **Save** writes a `.aivp` project file; **Open** loads one.
8. **Export** — toolbar **Export** renders the active sequence to an `.mp4` via the FFmpeg sidecar.

## Using the in-app agent

1. Open the **Agent** tab (right panel).
2. Paste your **Anthropic API key** when prompted (stored locally; moves to the OS keychain in a later release).
3. Ask it to edit, e.g.:
   - "Import ~/Videos/clip.mp4 and add it to the timeline."
   - "Split the first clip at 5 seconds and delete the second half."
   - "Set the selected clip's opacity to 0.5."
   - "Export the sequence to ~/Desktop/out.mp4."

The agent calls the same commands the UI uses, so every change appears on the timeline and can be undone.

> Provider is pluggable via the `AgentProvider` interface (`src/renderer/ai/providers`). Claude (`claude-opus-4-8`) is the default; additional providers can be added without touching the agent loop.

## Connecting an external agent over MCP

With the app running, point any MCP client at the local server.

**Claude Code**

```bash
claude mcp add --transport http video-ai http://127.0.0.1:19789/mcp
```

**Cursor / Claude Desktop** — add to the MCP config:

```json
{
  "mcpServers": {
    "video-ai": { "url": "http://127.0.0.1:19789/mcp" }
  }
}
```

**Verify manually**

```bash
curl -s -X POST http://127.0.0.1:19789/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Available tools:** `import_media`, `create_sequence`, `add_track`, `add_clip`, `split_clip`, `trim_clip`, `move_clip`, `set_property`, `delete_clip`, `get_timeline_state`, `export`.

## Packaging desktop builds

```bash
npm run package:mac    # .dmg
npm run package:win    # NSIS installer
npm run package:linux  # AppImage + .deb
```

For packaged builds, place static FFmpeg binaries under `resources/ffmpeg/<platform>/`:

```
resources/ffmpeg/mac/{ffmpeg,ffprobe}
resources/ffmpeg/win/{ffmpeg.exe,ffprobe.exe}
resources/ffmpeg/linux/{ffmpeg,ffprobe}
```

(See `resources/ffmpeg/.gitkeep`.) In development the app falls back to `ffmpeg`/`ffprobe` on `PATH`. You can also override the paths with the `FFMPEG_PATH` / `FFPROBE_PATH` environment variables.

## Project file format

A `.aivp` file is the JSON-serialized project, validated against `ProjectSchema` (`src/shared/schema.ts`) on load and save. Shape:

```
Project
 ├─ mediaPool: MediaItem[]          # imported sources (path, duration, dimensions, fps…)
 └─ sequences: Sequence[]           # width/height/fps + tracks
      └─ tracks: Track[]            # 'video' | 'audio'
           └─ clips: Clip[]         # mediaId, start, inPoint, outPoint, transform, effects
```

All times are in **seconds**. The `version` field gates breaking schema changes.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Launch the app with hot reload |
| `npm run build` | Build main/preload/renderer bundles |
| `npm start` | Preview the production build |
| `npm test` | Run unit tests (vitest) |
| `npm run typecheck` | Type-check main + renderer |
| `npm run package:*` | Build distributables (mac/win/linux) |

## Troubleshooting

- **"ffmpeg not found" / import or export fails** — install FFmpeg and ensure `ffmpeg -version` works in the same shell, or set `FFMPEG_PATH`/`FFPROBE_PATH`.
- **Black preview / "WebGL2 is not available"** — update GPU drivers. In VMs/headless setups, launch with software rendering: `npm run dev -- --disable-gpu` or set `LIBGL_ALWAYS_SOFTWARE=1`.
- **Preview shows nothing for a clip** — only video tracks render; very long sources are capped (~60s) in the current preview path. Codec support follows the browser's WebCodecs (H.264/AV1/VP9 widely supported; some HEVC/ProRes may not decode in-preview yet but still export via FFmpeg).
- **Agent says "Add your API key"** — paste an Anthropic key in the Agent panel. Requests go directly to `api.anthropic.com` (allowed by the app's CSP) and never leave your machine otherwise.
- **MCP shows "offline"** — another process may be using port `19789`; close it and restart.

## Roadmap

- Web Audio mixing + waveform display
- Drag/trim/ripple editing and snapping on the timeline
- Compositor-driven export (transforms/effects/multi-track baked into the render)
- Generative AI in the timeline (text-to-video/image/audio via pluggable model providers)
- Transcription & caption editing
- OS-keychain storage for API keys; WebGPU compositor

## License

GPL-3.0-or-later. © Gediminas Survila.
