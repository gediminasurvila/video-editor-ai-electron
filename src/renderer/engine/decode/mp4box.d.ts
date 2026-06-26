/**
 * Minimal ambient types for the subset of mp4box.js this project uses. The
 * library ships no types and a UMD build; we only need file creation, the
 * ready/samples callbacks, and enough of the sample/track shape to build
 * WebCodecs configs and chunks.
 */
declare module 'mp4box' {
  export interface MP4MediaTrack {
    id: number
    codec: string
    timescale: number
    duration: number
    nb_samples: number
    track_width?: number
    track_height?: number
  }

  export interface MP4Info {
    tracks: MP4MediaTrack[]
    videoTracks: MP4MediaTrack[]
    audioTracks: MP4MediaTrack[]
  }

  export interface MP4Sample {
    is_sync: boolean
    cts: number
    dts: number
    duration: number
    timescale: number
    data: Uint8Array
  }

  export interface MP4Box {
    onReady: (info: MP4Info) => void
    onError: (e: string) => void
    onSamples: (trackId: number, ref: unknown, samples: MP4Sample[]) => void
    appendBuffer(data: ArrayBuffer & { fileStart: number }): number
    start(): void
    stop(): void
    flush(): void
    setExtractionOptions(trackId: number, user?: unknown, opts?: { nbSamples?: number }): void
    getTrackById(id: number): {
      mdia: { minf: { stbl: { stsd: { entries: Array<Record<string, unknown>> } } } }
    }
  }

  export function createFile(): MP4Box
  export class DataStream {
    constructor(buffer?: ArrayBuffer, byteOffset?: number, endianness?: boolean)
    buffer: ArrayBuffer
    static BIG_ENDIAN: boolean
    static LITTLE_ENDIAN: boolean
  }
}
