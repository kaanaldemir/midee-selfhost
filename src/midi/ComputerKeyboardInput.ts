import type { MasterClock } from '../core/clock/MasterClock'
import { pitchToNoteName } from '../core/midi/types'
import { createEventSignal } from '../store/eventSignal'
import type { MidiNoteEvent } from './MidiInputManager'

// FL Studio / DAW-style typing-keyboard layout.
// Two octaves: the bottom row (Z..) plus its black keys on the S..row;
// the top row (Q..) plus its black keys on the number row.
const DEFAULT_OCTAVE = 4
const DEFAULT_VELOCITY = 0.75

export type BindingRow = 'lower' | 'upper'

export interface ComputerKeyboardBinding {
  code: string
  label: string
  offset: number
}

export interface ComputerKeyboardBindingRows {
  lower: ComputerKeyboardBinding[]
  upper: ComputerKeyboardBinding[]
}

const DEFAULT_BINDINGS: ComputerKeyboardBindingRows = {
  lower: [
    { code: 'KeyZ', label: 'Z', offset: 0 },
    { code: 'KeyS', label: 'S', offset: 1 },
    { code: 'KeyX', label: 'X', offset: 2 },
    { code: 'KeyD', label: 'D', offset: 3 },
    { code: 'KeyC', label: 'C', offset: 4 },
    { code: 'KeyV', label: 'V', offset: 5 },
    { code: 'KeyG', label: 'G', offset: 6 },
    { code: 'KeyB', label: 'B', offset: 7 },
    { code: 'KeyH', label: 'H', offset: 8 },
    { code: 'KeyN', label: 'N', offset: 9 },
    { code: 'KeyJ', label: 'J', offset: 10 },
    { code: 'KeyM', label: 'M', offset: 11 },
    { code: 'Comma', label: 'Ö', offset: 12 },
    { code: 'KeyL', label: 'L', offset: 13 },
    { code: 'Period', label: 'Ç', offset: 14 },
    { code: 'Semicolon', label: 'Ş', offset: 15 },
    { code: 'Slash', label: '.', offset: 16 },
  ],
  upper: [
    { code: 'KeyQ', label: 'Q', offset: 12 },
    { code: 'Digit2', label: '2', offset: 13 },
    { code: 'KeyW', label: 'W', offset: 14 },
    { code: 'Digit3', label: '3', offset: 15 },
    { code: 'KeyE', label: 'E', offset: 16 },
    { code: 'KeyR', label: 'R', offset: 17 },
    { code: 'Digit5', label: '5', offset: 18 },
    { code: 'KeyT', label: 'T', offset: 19 },
    { code: 'Digit6', label: '6', offset: 20 },
    { code: 'KeyY', label: 'Y', offset: 21 },
    { code: 'Digit7', label: '7', offset: 22 },
    { code: 'KeyU', label: 'U', offset: 23 },
    { code: 'KeyI', label: 'I', offset: 24 },
    { code: 'Digit9', label: '9', offset: 25 },
    { code: 'KeyO', label: 'O', offset: 26 },
    { code: 'Digit0', label: '0', offset: 27 },
    { code: 'KeyP', label: 'P', offset: 28 },
  ],
}

const RESERVED_BINDING_CODES = new Set([
  'AltLeft',
  'AltRight',
  'ArrowDown',
  'ArrowUp',
  'CapsLock',
  'ControlLeft',
  'ControlRight',
  'Escape',
  'MetaLeft',
  'MetaRight',
  'ShiftLeft',
  'ShiftRight',
  'Space',
  'Tab',
])

export interface ComputerKeyboardPitchLabel {
  pitch: number
  note: string
  lower: readonly string[]
  upper: readonly string[]
}

export function getDefaultComputerKeyboardBindings(): ComputerKeyboardBindingRows {
  return cloneBindings(DEFAULT_BINDINGS)
}

export async function getLayoutAwareComputerKeyboardBindings(): Promise<ComputerKeyboardBindingRows> {
  const keyboard = getNavigatorKeyboard()
  if (!keyboard?.getLayoutMap) return getDefaultComputerKeyboardBindings()
  try {
    const layoutMap = await keyboard.getLayoutMap()
    return applyLayoutLabels(DEFAULT_BINDINGS, layoutMap)
  } catch {
    return getDefaultComputerKeyboardBindings()
  }
}

export function getDefaultComputerKeyboardBindingRow(row: BindingRow): ComputerKeyboardBinding[] {
  return DEFAULT_BINDINGS[row].map((binding) => ({ ...binding }))
}

export function cloneComputerKeyboardBindings(
  rows: ComputerKeyboardBindingRows,
): ComputerKeyboardBindingRows {
  return cloneBindings(rows)
}

export function normalizeComputerKeyboardBindings(raw: unknown): ComputerKeyboardBindingRows {
  if (!raw || typeof raw !== 'object') return getDefaultComputerKeyboardBindings()
  const rows = raw as Partial<Record<BindingRow, unknown>>
  const normalized = {
    lower: normalizeBindingRow(rows.lower, DEFAULT_BINDINGS.lower),
    upper: normalizeBindingRow(rows.upper, DEFAULT_BINDINGS.upper),
  }
  return dedupeBindings(normalized)
}

export function setComputerKeyboardBinding(
  rows: ComputerKeyboardBindingRows,
  row: BindingRow,
  index: number,
  code: string,
  label: string,
): ComputerKeyboardBindingRows {
  const next = cloneBindings(rows)
  const target = next[row][index]
  if (!target || RESERVED_BINDING_CODES.has(code)) return next
  const oldCode = target.code
  const oldLabel = target.label
  for (const rowId of ['lower', 'upper'] as const) {
    const duplicateIndex = next[rowId].findIndex((binding) => binding.code === code)
    if (duplicateIndex < 0 || (rowId === row && duplicateIndex === index)) continue
    next[rowId][duplicateIndex] = {
      ...next[rowId][duplicateIndex]!,
      code: oldCode,
      label: oldLabel,
    }
  }
  next[row][index] = { ...target, code, label }
  return next
}

export function keyEventToComputerKeyboardBinding(
  e: KeyboardEvent,
): { code: string; label: string } | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null
  if (!e.code || RESERVED_BINDING_CODES.has(e.code)) return null
  const label = formatKeyLabel(e)
  return label ? { code: e.code, label } : null
}

export function getComputerKeyboardPitchLabels(
  octave: number,
  rows: ComputerKeyboardBindingRows = DEFAULT_BINDINGS,
): ComputerKeyboardPitchLabel[] {
  const byPitch = new Map<number, { lower: string[]; upper: string[] }>()
  for (const rowId of ['lower', 'upper'] as const) {
    for (const binding of rows[rowId]) {
      const pitch = 12 * (octave + 1) + binding.offset
      if (pitch < 21 || pitch > 108) continue
      let row = byPitch.get(pitch)
      if (!row) {
        row = { lower: [], upper: [] }
        byPitch.set(pitch, row)
      }
      row[rowId].push(binding.label)
    }
  }

  return Array.from(byPitch.entries())
    .sort(([a], [b]) => a - b)
    .map(([pitch, row]) => ({
      pitch,
      note: pitchToNoteName(pitch),
      lower: row.lower,
      upper: row.upper,
    }))
}

function normalizeBindingRow(raw: unknown, fallback: ComputerKeyboardBinding[]): ComputerKeyboardBinding[] {
  if (!Array.isArray(raw) || raw.length !== fallback.length)
    return fallback.map((binding) => ({ ...binding }))
  return fallback.map((defaultBinding, index) => {
    const item = raw[index]
    if (!item || typeof item !== 'object') return { ...defaultBinding }
    const candidate = item as Partial<ComputerKeyboardBinding>
    if (
      typeof candidate.code !== 'string' ||
      candidate.code.length === 0 ||
      RESERVED_BINDING_CODES.has(candidate.code) ||
      typeof candidate.label !== 'string' ||
      candidate.label.length === 0
    ) {
      return { ...defaultBinding }
    }
    return {
      code: candidate.code,
      label: candidate.label.slice(0, 8),
      offset: defaultBinding.offset,
    }
  })
}

function dedupeBindings(rows: ComputerKeyboardBindingRows): ComputerKeyboardBindingRows {
  const next = cloneBindings(rows)
  const seen = new Set<string>()
  for (const rowId of ['lower', 'upper'] as const) {
    for (let i = 0; i < next[rowId].length; i++) {
      const binding = next[rowId][i]!
      if (!seen.has(binding.code)) {
        seen.add(binding.code)
        continue
      }
      const replacement =
        DEFAULT_BINDINGS[rowId].find((candidate) => !seen.has(candidate.code)) ??
        DEFAULT_BINDINGS[rowId][i]!
      next[rowId][i] = { ...replacement }
      seen.add(next[rowId][i]!.code)
    }
  }
  return next
}

function cloneBindings(rows: ComputerKeyboardBindingRows): ComputerKeyboardBindingRows {
  return {
    lower: rows.lower.map((binding) => ({ ...binding })),
    upper: rows.upper.map((binding) => ({ ...binding })),
  }
}

interface KeyboardLayoutMapLike {
  get(code: string): string | undefined
}

interface NavigatorKeyboardLike {
  getLayoutMap?: () => Promise<KeyboardLayoutMapLike>
}

function getNavigatorKeyboard(): NavigatorKeyboardLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { keyboard?: NavigatorKeyboardLike }).keyboard
}

function applyLayoutLabels(
  rows: ComputerKeyboardBindingRows,
  layoutMap: KeyboardLayoutMapLike,
): ComputerKeyboardBindingRows {
  const next = cloneBindings(rows)
  for (const rowId of ['lower', 'upper'] as const) {
    for (const binding of next[rowId]) {
      const label = formatLayoutLabel(layoutMap.get(binding.code))
      if (label) binding.label = label
    }
  }
  return next
}

function formatLayoutLabel(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  if (value.length === 1) return value.toLocaleUpperCase()
  return value.slice(0, 8)
}

function buildNoteMap(rows: ComputerKeyboardBindingRows): Map<string, number> {
  const noteMap = new Map<string, number>()
  for (const row of [rows.lower, rows.upper]) {
    for (const binding of row) {
      noteMap.set(binding.code, binding.offset)
    }
  }
  return noteMap
}

function formatKeyLabel(e: KeyboardEvent): string {
  if (e.key && e.key.length === 1) return e.key.toLocaleUpperCase()
  const named: Record<string, string> = {
    Backspace: 'Bksp',
    Delete: 'Del',
    Enter: 'Enter',
    Equal: '=',
    Minus: '-',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Backquote: '`',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
  }
  if (named[e.code]) return named[e.code]!
  if (e.code.startsWith('Key')) return e.code.slice(3)
  if (e.code.startsWith('Digit')) return e.code.slice(5)
  if (e.code.startsWith('Numpad')) return `N${e.code.slice(6)}`
  return e.key || ''
}

// Reads the browser keydown/keyup stream and translates it into synthetic
// MIDI note events. Only active while live mode is enabled.
export class ComputerKeyboardInput {
  readonly noteOn = createEventSignal<MidiNoteEvent | null>(null)
  readonly noteOff = createEventSignal<MidiNoteEvent | null>(null)
  readonly octave = createEventSignal<number>(DEFAULT_OCTAVE)
  // Software stand-in for a sustain pedal: Space-bar hold mirrors a damper.
  // Useful for users without hardware pedals; merged with the MIDI-device
  // pedal upstream in App so either source can engage sustain.
  readonly pedal = createEventSignal<boolean>(false)

  private active = false
  private held = new Map<string, number>() // code -> pitch (for correct release after octave change)
  private pedalHeld = false
  private bindings = getDefaultComputerKeyboardBindings()
  private noteMap = buildNoteMap(this.bindings)

  constructor(private readonly clock: MasterClock) {}

  setBindings(rows: ComputerKeyboardBindingRows): void {
    this.releaseAllHeld()
    this.bindings = cloneBindings(rows)
    this.noteMap = buildNoteMap(this.bindings)
  }

  getBindings(): ComputerKeyboardBindingRows {
    return cloneBindings(this.bindings)
  }

  enable(): void {
    if (this.active) return
    this.active = true
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  disable(): void {
    if (!this.active) return
    this.active = false
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.releaseAllHeld()
    if (this.pedalHeld) {
      this.pedalHeld = false
      this.pedal.set(false)
    }
  }

  shiftOctaveUp(): void {
    const next = Math.min(this.octave.value + 1, 7)
    if (next !== this.octave.value) this.octave.set(next)
  }

  shiftOctaveDown(): void {
    const next = Math.max(this.octave.value - 1, 0)
    if (next !== this.octave.value) this.octave.set(next)
  }

  private releaseAllHeld(): void {
    const t = this.clock.currentTime
    for (const [, pitch] of this.held) {
      this.noteOff.set({ pitch, velocity: 0, clockTime: t })
    }
    this.held.clear()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.shouldIgnore(e)) return

    // Spacebar = software sustain pedal (hold to engage, release to lift).
    // Placed before arrow-key handling so auto-repeat doesn't re-emit.
    if (e.code === 'Space') {
      e.preventDefault()
      if (!this.pedalHeld) {
        this.pedalHeld = true
        this.pedal.set(true)
      }
      return
    }

    if (e.code === 'ArrowDown') {
      e.preventDefault()
      this.shiftOctaveDown()
      return
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault()
      this.shiftOctaveUp()
      return
    }

    const offset = this.noteMap.get(e.code)
    if (offset === undefined) return

    e.preventDefault()
    if (e.repeat) return
    if (this.held.has(e.code)) return

    const pitch = 12 * (this.octave.value + 1) + offset
    if (pitch < 21 || pitch > 108) return

    this.held.set(e.code, pitch)
    this.noteOn.set({ pitch, velocity: DEFAULT_VELOCITY, clockTime: this.clock.currentTime })
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && this.pedalHeld) {
      this.pedalHeld = false
      this.pedal.set(false)
      return
    }
    const pitch = this.held.get(e.code)
    if (pitch === undefined) return
    this.held.delete(e.code)
    this.noteOff.set({ pitch, velocity: 0, clockTime: this.clock.currentTime })
  }

  private shouldIgnore(e: KeyboardEvent): boolean {
    // Shift reserves letter keys for app-level hotkeys (Shift+R record,
    // Shift+L loop, etc.); without this guard the user would also trigger a
    // note via the FL-style key map whenever they hit a shortcut.
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return true
    const target = e.target as HTMLElement | null
    if (!target) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
  }

  dispose(): void {
    this.disable()
  }
}
