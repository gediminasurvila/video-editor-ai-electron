// Assembles build/icon.ico (Windows) and build/icon.icns (macOS) from the
// per-size PNGs in build/icons/. Both formats support embedding PNG data
// directly, so no native image tooling is required.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const png = (size) => readFileSync(resolve(root, `build/icons/${size}x${size}.png`))

// ---- ICO (PNG-compressed entries; supported on Windows Vista+) ----
function buildIco(sizes) {
  const images = sizes.map((s) => ({ size: s, data: png(s) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const entries = Buffer.alloc(16 * images.length)
  let offset = 6 + entries.length
  images.forEach((img, i) => {
    const e = i * 16
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 0) // width
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1) // height
    entries.writeUInt8(0, e + 2) // colors in palette
    entries.writeUInt8(0, e + 3) // reserved
    entries.writeUInt16LE(1, e + 4) // color planes
    entries.writeUInt16LE(32, e + 6) // bits per pixel
    entries.writeUInt32LE(img.data.length, e + 8) // size of image data
    entries.writeUInt32LE(offset, e + 12) // offset of image data
    offset += img.data.length
  })

  return Buffer.concat([header, entries, ...images.map((i) => i.data)])
}

// ---- ICNS (PNG entries keyed by OSType) ----
function buildIcns(map) {
  const chunks = []
  for (const [type, size] of Object.entries(map)) {
    const data = png(size)
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(data.length + 8, 4)
    chunks.push(head, data)
  }
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

const ico = buildIco([16, 24, 32, 48, 64, 128, 256])
writeFileSync(resolve(root, 'build/icon.ico'), ico)

const icns = buildIcns({
  icp4: 16,
  icp5: 32,
  icp6: 64,
  ic07: 128,
  ic08: 256,
  ic09: 512,
  ic10: 1024
})
writeFileSync(resolve(root, 'build/icon.icns'), icns)

console.log(`icon.ico  ${ico.length} bytes`)
console.log(`icon.icns ${icns.length} bytes`)
