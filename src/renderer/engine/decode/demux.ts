import * as MP4Box from 'mp4box'
import type { MP4Info, MP4MediaTrack, MP4Sample } from 'mp4box'

export interface DemuxResult {
  config: VideoDecoderConfig
  chunks: EncodedVideoChunk[]
}

/** Extract the codec-specific description (avcC/hvcC/vpcC/av1C box payload). */
function codecDescription(file: MP4Box.MP4Box, track: MP4MediaTrack): Uint8Array | undefined {
  const entry = file.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0] as Record<
    string,
    { write?: (ds: MP4Box.DataStream) => void }
  >
  const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C
  if (!box?.write) return undefined
  const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN)
  box.write(stream)
  // Strip the 8-byte box header (size + type) to leave the raw config record.
  return new Uint8Array(stream.buffer, 8)
}

/**
 * Demux an MP4/MOV byte buffer into a VideoDecoderConfig and the ordered
 * EncodedVideoChunks for its first video track. mp4box processes the buffer
 * synchronously when we append the whole file and flush, so we can resolve once
 * extraction completes.
 */
export function demuxVideo(bytes: ArrayBuffer): Promise<DemuxResult> {
  return new Promise((resolve, reject) => {
    const file = MP4Box.createFile()
    const chunks: EncodedVideoChunk[] = []
    let config: VideoDecoderConfig | null = null

    file.onError = (e) => reject(new Error(`mp4box: ${e}`))

    file.onReady = (info: MP4Info) => {
      const track = info.videoTracks[0]
      if (!track) {
        reject(new Error('No video track in media'))
        return
      }
      config = {
        codec: track.codec,
        codedWidth: track.track_width ?? 0,
        codedHeight: track.track_height ?? 0,
        description: codecDescription(file, track)
      }
      file.setExtractionOptions(track.id)
      file.start()
    }

    file.onSamples = (_id: number, _ref: unknown, samples: MP4Sample[]) => {
      for (const s of samples) {
        chunks.push(
          new EncodedVideoChunk({
            type: s.is_sync ? 'key' : 'delta',
            timestamp: (s.cts / s.timescale) * 1e6,
            duration: (s.duration / s.timescale) * 1e6,
            data: s.data
          })
        )
      }
    }

    const buf = bytes as ArrayBuffer & { fileStart: number }
    buf.fileStart = 0
    file.appendBuffer(buf)
    file.flush()

    // Samples are delivered synchronously during flush(); resolve next microtask.
    queueMicrotask(() => {
      if (!config) reject(new Error('Failed to read media configuration'))
      else resolve({ config, chunks })
    })
  })
}
