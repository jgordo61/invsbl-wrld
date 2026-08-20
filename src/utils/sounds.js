// ── INVSBL WRLD — Sound Manager ──────────────────────────────────────────────
// Auto-loads sound effects from src/assets/sounds/<trigger-name>/ the same
// way main.js auto-loads gallery photos: drop a file in the folder matching
// the interaction you want, no code changes needed. See ADDING_SOUND.md.
//
// Uses the Web Audio API with pre-decoded buffers (not <audio> elements) so
// playback is near-instant and rapid-fire triggers (e.g. fast hovering)
// don't stall waiting on network/decode — decoding happens once, up front,
// after unlock().
// ══════════════════════════════════════════════════════════════════════════

const soundModules = import.meta.glob(
  '../assets/sounds/*/*.{mp3,wav,ogg,m4a,aif,aiff,MP3,WAV,OGG,M4A,AIF,AIFF}',
  { eager: true, import: 'default' }
)

// Collected with filenames so 'cycle' mode below has a stable, predictable
// order (glob key order isn't guaranteed to be alphabetical).
const _filesByTrigger = {}
for (const path in soundModules) {
  const match = path.match(/\/sounds\/([^/]+)\/([^/]+)$/)
  if (!match) continue
  const [, folder, filename] = match
  ;(_filesByTrigger[folder] ??= []).push({ filename, url: soundModules[path] })
}

const urlsByTrigger = {}
for (const folder in _filesByTrigger) {
  urlsByTrigger[folder] = _filesByTrigger[folder]
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }))
    .map(f => f.url)
}

const MUTE_KEY = 'invsbl-sound-muted'

// Playback mode per trigger folder — 'random' (default) picks a random
// variation each play; 'cycle' steps through the folder's files in order
// (sorted by filename), wrapping around. Add entries here to override the
// default for any trigger.
const PLAYBACK_MODE = {
  nav: 'cycle',
}

// Per-trigger volume trim in dB (0 = unchanged, negative = quieter).
// Applied as a linear gain multiplier: gain = 10^(dB/20).
const VOLUME_DB = {
  'gallery-tick': -4,
}
const dbToGain = db => Math.pow(10, db / 20)

class SoundManager {
  constructor() {
    this._ctx        = null
    this._buffers     = {}     // trigger name -> [AudioBuffer, ...]
    this._cycleIndex  = {}     // trigger name -> next index for 'cycle' mode
    this._lastRandomIndex = {} // trigger name -> last index picked in 'random' mode
    this._decodePromise = null
    this._muted       = localStorage.getItem(MUTE_KEY) === '1'

    this._ambientGain   = null
    this._ambientSource = null
    this._wantAmbient   = false   // true while the shop wants ambient playing
  }

  isMuted() { return this._muted }

  toggleMute() {
    this._muted = !this._muted
    localStorage.setItem(MUTE_KEY, this._muted ? '1' : '0')
    if (this._muted) this._stopAmbient()
    else if (this._wantAmbient) this._startAmbient()
    return this._muted
  }

  // Must be called from within a user-gesture handler (click/touch/keydown) —
  // browsers block AudioContext creation/playback otherwise. Safe to call
  // more than once; only does real work the first time.
  async unlock() {
    if (!this._ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return   // no Web Audio support — sounds just silently no-op
      this._ctx = new Ctx()
    }
    if (this._ctx.state === 'suspended') {
      try { await this._ctx.resume() } catch (_) {}
    }
    if (!this._decodePromise) this._decodePromise = this._decodeAll()
    await this._decodePromise
  }

  async _decodeAll() {
    const entries = Object.entries(urlsByTrigger)
    await Promise.all(entries.map(async ([trigger, urls]) => {
      const buffers = await Promise.all(urls.map(async url => {
        try {
          const res = await fetch(url)
          const arr = await res.arrayBuffer()
          return await this._ctx.decodeAudioData(arr)
        } catch (err) {
          console.warn(`[sounds] Failed to decode "${url}":`, err)
          return null
        }
      }))
      this._buffers[trigger] = buffers.filter(Boolean)
    }))
  }

  // Plays one random variation from src/assets/sounds/<trigger>/ (if any
  // exist and aren't muted). Silently no-ops otherwise — an empty/missing
  // folder is never an error, same spirit as the photo gallery's NO SIGNAL.
  // `delayMs` schedules playback that many milliseconds out — useful for
  // lining a sound up with a visual transition instead of the raw input
  // event, e.g. play('nav', 25) so it lands with the new item rendering
  // rather than the instant the arrow key/dot was hit. Scheduled via the
  // AudioContext clock (not setTimeout) for sample-accurate timing that
  // isn't subject to JS event-loop jitter.
  // Awaits the in-flight decode (started by unlock()) before checking for
  // buffers — on a true first visit, play('enter') fires on the very next
  // line after unlock(), with zero time for decoding to finish, so it would
  // otherwise silently find no buffers yet and never play (same race as
  // startAmbient() had — see its comment).
  async play(trigger, delayMs = 0) {
    if (this._muted || !this._ctx) return
    if (this._decodePromise) await this._decodePromise
    if (this._muted) return   // re-check — mute may have been toggled while awaiting
    const buffers = this._buffers[trigger]
    if (!buffers?.length) return

    const buffer = this._pickBuffer(trigger, buffers)
    const source = this._ctx.createBufferSource()
    source.buffer = buffer

    const db = VOLUME_DB[trigger]
    if (db) {
      const gain = this._ctx.createGain()
      gain.gain.value = dbToGain(db)
      source.connect(gain)
      gain.connect(this._ctx.destination)
    } else {
      source.connect(this._ctx.destination)
    }

    source.start(this._ctx.currentTime + delayMs / 1000)
  }

  // 'cycle' steps through a trigger's files in order (wrapping around);
  // 'random' (default) picks any one, but never the same file twice in a
  // row (when more than one exists) so back-to-back plays don't repeat.
  _pickBuffer(trigger, buffers) {
    if (PLAYBACK_MODE[trigger] === 'cycle') {
      const i = this._cycleIndex[trigger] ?? 0
      this._cycleIndex[trigger] = (i + 1) % buffers.length
      return buffers[i]
    }

    if (buffers.length === 1) return buffers[0]
    let i
    do {
      i = Math.floor(Math.random() * buffers.length)
    } while (i === this._lastRandomIndex[trigger])
    this._lastRandomIndex[trigger] = i
    return buffers[i]
  }

  // Loops src/assets/sounds/ambient/ (one random variation, picked once)
  // while the shop is open. Call stopAmbient() on exit back to landing.
  // Awaits the in-flight decode (started by unlock()) before checking for
  // buffers — on a first/cold shop entry, decoding the ambient file can
  // still be running when this fires, and _startAmbient() would otherwise
  // silently find no buffers yet and never retry.
  async startAmbient() {
    this._wantAmbient = true
    if (this._decodePromise) await this._decodePromise
    if (this._wantAmbient && !this._muted) this._startAmbient()
  }

  stopAmbient() {
    this._wantAmbient = false
    this._stopAmbient()
  }

  _startAmbient() {
    if (this._ambientSource || !this._ctx) return
    const buffers = this._buffers['ambient']
    if (!buffers?.length) return

    const buffer = buffers[Math.floor(Math.random() * buffers.length)]
    const gain   = this._ctx.createGain()
    gain.gain.value = 0.35
    gain.connect(this._ctx.destination)

    const source = this._ctx.createBufferSource()
    source.buffer = buffer
    source.loop   = true
    source.connect(gain)
    source.start(0)

    this._ambientSource = source
    this._ambientGain   = gain
  }

  _stopAmbient() {
    if (this._ambientSource) {
      try { this._ambientSource.stop() } catch (_) {}
      this._ambientSource.disconnect()
      this._ambientSource = null
    }
    if (this._ambientGain) {
      this._ambientGain.disconnect()
      this._ambientGain = null
    }
  }
}

// Singleton — import { sounds } from wherever a trigger needs to fire.
export const sounds = new SoundManager()
