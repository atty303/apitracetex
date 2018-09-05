export class RingBuffer {
  private _buffer
  private _position = 0

  private _remaining = 0

  constructor(capacity) {
    this._buffer = Buffer.alloc(capacity)
  }

  remaining() {
    return this._remaining
  }

  put(buffer) {
    if (!this.canPut(buffer.length)) this.compact()
    if (!this.canPut(buffer.length)) return false
    buffer.copy(this._buffer, this._position + this._remaining)
    this._remaining += buffer.length
    return true
  }

  canPut(length) {
    return this._position + this._remaining + length < this._buffer.length
  }

  compact() {
    this._buffer.copy(this._buffer, 0, this._position, this._position + this._remaining)
    this._position = 0
  }

  peek(length) {
    if (length > this._remaining) return undefined
    return this._buffer.slice(this._position, this._position + length)
  }

  get(length) {
    const state = this.peek(length)
    if (state) {
      this._position += length
      this._remaining -= length
    }
    return state
  }
}
