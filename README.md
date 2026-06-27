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

It's built to be simple — closer to Camtasia/ScreenFlow than to Premiere. No setup required:

1. **Import** — click **+ Import** (or just **drag video/audio files onto the window**). A project is created automatically and your clip lands on the timeline, ready to play. No AI needed.
2. **Edit directly on the timeline** (bottom):
   - **Drag a clip** to move it; **drag its left/right edge** to trim.
   - **Drag the ruler** to scrub the playhead.
   - Clips **snap** to the playhead and to each other.
   - **✂ Split** cuts the selected clip at the playhead; **🗑 Delete** removes it.
   - **− / Fit / +** zoom the timeline.
3. **Adjust properties** — select a clip; the **Properties** panel (right) sets position, scale, rotation, opacity.
4. **Preview** — press **▶** (or Space); the WebGL engine composites the frame on the canvas.
5. **Save / Open** — **Save** writes a `.aivp` project; **Open** loads one.
6. **Export** — **⬆ Export** renders to `.mp4` via the bundled FFmpeg, with progress in the toolbar.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `S` or `B` | Split selected clip at playhead |
| `Delete` / `Backspace` | Delete selected clip |
| `←` / `→` | Nudge playhead (hold `Shift` = 1s) |
| `Home` | Jump to start |
| `⌘/Ctrl+Z` / `⌘/Ctrl+Shift+Z` | Undo / redo |
| `⌘/Ctrl+I` | Import media |

The **✨ AI assistant** is an optional tab — everything above works without it.

## Using the in-app agent

1. Open the **✨ AI assistant** tab (right panel).
2. Paste your **Anthropic API key** when prompted (or set it in **Settings**; stored locally, moves to the OS keychain in a later release).
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

## Installing the app (from a release)

Download the installer for your platform from the [latest release](https://github.com/gediminasurvila/video-editor-ai-electron/releases/latest). FFmpeg is bundled — nothing else to install. The current builds are **unsigned**, so each OS shows a one-time warning on first launch:

**macOS** — open the DMG for your chip (`arm64` = Apple Silicon, `x64` = Intel) and drag **Video AI** to Applications. Then:
1. Right-click the app → **Open** → **Open**.
2. If it reports *"damaged / can't be opened"*, clear the download quarantine flag:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Video AI.app"
   ```

**Windows** — run `Video AI-…-Setup-x64.exe`. If SmartScreen appears, click **More info → Run anyway**.

**Linux**
```bash
chmod +x 'Video AI-…-x86_64.AppImage' && ./'Video AI-…-x86_64.AppImage'   # needs libfuse2
# or
sudo apt install ./'Video AI-…-amd64.deb'
```

## Packaging desktop builds

```bash
npm run package:mac    # .dmg (x64 + arm64)
npm run package:win    # NSIS installer
npm run package:linux  # AppImage + .deb
```

FFmpeg/ffprobe are bundled automatically via `ffmpeg-static` / `ffprobe-static` (unpacked from the asar so they stay executable) — no manual binaries needed. In development the app uses the same bundled binaries, falling back to `ffmpeg`/`ffprobe` on `PATH`; override with `FFMPEG_PATH` / `FFPROBE_PATH`.

Releases are built automatically: pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`, which builds installers on native Windows/macOS/Linux runners and attaches them to the GitHub Release.

### Code signing & notarization

The pipeline signs and notarizes **automatically when the relevant repo secrets are present**, and falls back to unsigned builds when they aren't (so it works out of the box). To enable trusted builds, add these secrets (Settings → Secrets and variables → Actions):

| Secret | Purpose |
| --- | --- |
| `MAC_CSC_LINK` | base64 of your Apple **Developer ID Application** cert (`.p12`) |
| `MAC_CSC_KEY_PASSWORD` | password for that `.p12` |
| `APPLE_ID` | Apple ID email (for notarization) |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | your Apple Developer Team ID |
| `WIN_CSC_LINK` | base64 of your Windows code-signing cert (`.pfx`) |
| `WIN_CSC_KEY_PASSWORD` | password for that `.pfx` |

```bash
# Encode a certificate for the *_CSC_LINK secrets:
base64 -i DeveloperID.p12 | pbcopy      # macOS
base64 -w0 codesign.pfx                  # Linux
```

macOS signing uses hardened runtime + `build/entitlements.mac.plist`; notarization runs via the `afterSign` hook (`build/notarize.cjs`), which skips automatically when the `APPLE_*` secrets are absent.

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
