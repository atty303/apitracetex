import * as child_process from 'child_process'
import * as jsonlines from 'jsonlines'
import * as fs from 'fs'
import * as events from 'events'
import * as process from 'process'
import * as crypto from 'crypto'
import * as stream from 'stream'
import { EventEmitter } from 'events'

import { Ubjson, UbjsonDecoder } from '@shelacek/ubjson'



import * as imageType from 'image-type'
import { RingBuffer } from './ringBuffer'



const dumpTextures = (textures: object) => {
  const parsedTextures = {}
  Object.keys(textures).forEach(key => {
    console.log(`${key}`)
    const tex = textures[key]
    const data = Buffer.from(tex['__data__'], 'base64')
    const hash = crypto.createHash('sha256')
    hash.update(data)
    const digest = hash.digest('hex')
    console.log(digest)

    if (!(digest in parsedTextures)) {
      console.log(digest)
    }
    parsedTextures[digest] = true

    const it = imageType(data)
    console.log(it)
    fs.writeFileSync(`out/${digest}.${it.ext}`, data)

    //console.log(data.slice(0, 2))
  });
}

class ApiTraceStateDuplex extends stream.Duplex {
  writable = true

  private decoder = new UbjsonDecoder({
    int64Handling: 'raw'
  })
  private buffer = new RingBuffer(10 * 1024 * 1024)
  private payloadSize = -1
  private states = []

  constructor() {
    super({
      readableObjectMode: true
    })
  }

  _write(chunk, encoding, cb) {
    console.log(`data: ${chunk.length}`)
    if (!chunk || !(chunk instanceof Buffer)) {
      cb(new Error('chunk is not Buffer'))
    } else {
      this.buffer.put(chunk)

      if (this.payloadSize < 0) {
        if (this.buffer.remaining() >= 4) {
          this.payloadSize = this.buffer.get(4).readInt32BE(0)
          chunk = chunk.slice(4)
        }
      }

      if (this.payloadSize >= 0) {
        if (this.buffer.remaining() >= this.payloadSize) {
          const payload = this.buffer.get(this.payloadSize)
          return this._payload(payload, cb)
          this.payloadSize = -1
        }
      }

      cb()
    }
  }

  end(chunk) {
    if (chunk) this._write(chunk, undefined, () => undefined)
  }

  _payload(payload, cb) {
    const state = this.decoder.decode(payload)
    //console.log(state)
    this.states.push(state)
    cb()
  }

  _read(size) {
    console.log(`read(${size})`)
    const res = this.states.shift()
    console.log(res)
    this.push(res)
  }
}

if (require.main === module) {
  let stdin: stream.Readable = process.stdin
  if (true) {
    stdin = fs.createReadStream('500.ubj')
  }

  const writable = new ApiTraceStateDuplex()
  stdin.pipe(writable)
  writable.on('data', (s) => dumpTextures(s.textures))
  writable.on('data', (s) => dumpTextures(s.framebuffer))
  stdin.resume()
}
