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



const parsedTextures = {}
const dumpTextures = (textures: object) => {
  Object.keys(textures).forEach(key => {
    const tex = textures[key]
    const data = Buffer.from(tex['__data__'], 'base64')
    const hash = crypto.createHash('sha256')
    hash.update(data)
    const digest = hash.digest('hex')

    if (parsedTextures[digest]) {
      return
    }
    parsedTextures[digest] = true

    console.debug(`${key}`)
    const it = imageType(data)
    const name = `${digest}.${it.ext}`
    console.log(name)
    fs.writeFileSync(`out/${name}`, data)

    //console.log(data.slice(0, 2))
  });
}

const decoder = new UbjsonDecoder({
  int64Handling: 'raw',
  highPrecisionNumberHandling: 'raw'
})

class ApiTraceStateDuplex extends stream.Transform {
  private buffer = new RingBuffer(100 * 1024 * 1024)
  private payloadSize = -1
  private frame = 0

  constructor() {
    super({
      readableObjectMode: true
    })
  }

  _transform(chunk, encoding, cb) {
    //console.debug(`data: ${chunk.length}`)
    if (!chunk || !(chunk instanceof Buffer)) {
      cb(new Error('chunk is not Buffer'))
    } else {
      this.buffer.put(chunk)

      while (this.canParse) {
        if (this.payloadSize < 0) {
          if (this.buffer.remaining() >= 4) {
            this.payloadSize = this.buffer.get(4).readInt32BE(0)
          }
        }

        if (this.payloadSize >= 0) {
          if (this.buffer.remaining() >= this.payloadSize) {
            // console.debug(`payload: ${this.payloadSize} remaining: ${this.buffer.remaining()}`)

            const payload = this.buffer.get(this.payloadSize)

            const hash = crypto.createHash('sha256')
            hash.update(payload)
            const digest = hash.digest('hex')
            //console.debug(digest)

            let state
            try {
              state = decoder.decode(payload)
            } catch (err) {
              console.log(`failed to decode payload at frame ${this.frame}`, err)
              const b = Buffer.alloc(4 + this.payloadSize)
              b.writeInt32BE(this.payloadSize, 0)
              payload.copy(b, 4, 0, this.payloadSize)
              fs.writeFileSync('corrupted.ubj', b)
              cb(err)
              return
            }
            this.payloadSize = -1
            this.frame += 1
            this.push(state)
          }
        }
      }

      cb()
    }
  }

  get canParse() {
    return (this.payloadSize < 0 && this.buffer.remaining() >= 4)
      || (this.payloadSize >= 0 && this.buffer.remaining() >= this.payloadSize)
  }
}

if (require.main === module) {
  let stdin: stream.Readable = process.stdin
  if (false) {
    stdin = fs.createReadStream('corrupt.ubj')
  }

  const writable = new ApiTraceStateDuplex()
  stdin.pipe(writable)
  writable.on('data', (s) => dumpTextures(s.textures))
  //writable.on('data', (s) => dumpTextures(s.framebuffer))
  stdin.resume()
}
