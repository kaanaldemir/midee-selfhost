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
  shift?: boolean
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

const EXTENDED_MIN_PITCH = 36
const EXTENDED_MAX_PITCH = 96
const DEFAULT_BASE_PITCH = 12 * (DEFAULT_OCTAVE + 1)
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10])
const EXTENDED_WHITE_KEY_CODES = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyT',
  'KeyY',
  'KeyU',
  'KeyI',
  'KeyO',
  'KeyP',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyJ',
  'KeyK',
  'KeyL',
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyV',
  'KeyB',
  'KeyN',
  'KeyM',
] as const

const DEFAULT_SHIFT_LABELS: Record<string, string> = {
  Backquote: '~',
  Digit1: '!',
  Digit2: '@',
  Digit3: '#',
  Digit4: '$',
  Digit5: '%',
  Digit6: '^',
  Digit7: '&',
  Digit8: '*',
  Digit9: '(',
  Digit0: ')',
  Minus: '_',
  Equal: '+',
  BracketLeft: '{',
  BracketRight: '}',
  Backslash: '|',
  Semicolon: ':',
  Quote: '"',
  Comma: '<',
  Period: '>',
  Slash: '?',
}

const TURKISH_SHIFT_LABELS: Record<string, string> = {
  Digit1: '!',
  Digit2: "'",
  Digit3: '^',
  Digit4: '+',
  Digit5: '%',
  Digit6: '&',
  Digit7: '/',
  Digit8: '(',
  Digit9: ')',
  Digit0: '=',
}

const KOREAN_SHIFT_LABELS: Record<string, string> = {
  'ㅂ': 'ㅃ',
  'ㅈ': 'ㅉ',
  'ㄷ': 'ㄸ',
  'ㄱ': 'ㄲ',
  'ㅅ': 'ㅆ',
  'ㅐ': 'ㅒ',
  'ㅔ': 'ㅖ',
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

export function getDefaultExtendedComputerKeyboardBindings(): ComputerKeyboardBindingRows {
  return buildExtendedBindings()
}

export async function getLayoutAwareExtendedComputerKeyboardBindings(): Promise<ComputerKeyboardBindingRows> {
  const keyboard = getNavigatorKeyboard()
  if (!keyboard?.getLayoutMap) return getDefaultExtendedComputerKeyboardBindings()
  try {
    return buildExtendedBindings(await keyboard.getLayoutMap())
  } catch {
    return getDefaultExtendedComputerKeyboardBindings()
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
  return normalizeComputerKeyboardBindingsWithFallback(raw, DEFAULT_BINDINGS)
}

export function normalizeExtendedComputerKeyboardBindings(
  raw: unknown,
): ComputerKeyboardBindingRows {
  return normalizeComputerKeyboardBindingsWithFallback(raw, getDefaultExtendedComputerKeyboardBindings())
}

function normalizeComputerKeyboardBindingsWithFallback(
  raw: unknown,
  fallback: ComputerKeyboardBindingRows,
): ComputerKeyboardBindingRows {
  if (!raw || typeof raw !== 'object') return cloneBindings(fallback)
  const rows = raw as Partial<Record<BindingRow, unknown>>
  const normalized = {
    lower: normalizeBindingRow(rows.lower, fallback.lower),
    upper: normalizeBindingRow(rows.upper, fallback.upper),
  }
  return dedupeBindings(normalized, fallback)
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
  const targetShift = target.shift === true
  for (const rowId of ['lower', 'upper'] as const) {
    const duplicateIndex = next[rowId].findIndex(
      (binding) => binding.code === code && (binding.shift === true) === targetShift,
    )
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
  allowShift = false,
): { code: string; label: string } | null {
  if (e.ctrlKey || e.metaKey || e.altKey || (!allowShift && e.shiftKey)) return null
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
    const normalized: ComputerKeyboardBinding = {
      code: candidate.code,
      label: candidate.label.slice(0, 8),
      offset: defaultBinding.offset,
    }
    if (defaultBinding.shift !== undefined) normalized.shift = defaultBinding.shift
    return normalized
  })
}

function dedupeBindings(
  rows: ComputerKeyboardBindingRows,
  fallback: ComputerKeyboardBindingRows,
): ComputerKeyboardBindingRows {
  const next = cloneBindings(rows)
  const seen = new Set<string>()
  for (const rowId of ['lower', 'upper'] as const) {
    for (let i = 0; i < next[rowId].length; i++) {
      const binding = next[rowId][i]!
      const key = noteMapKey(binding.code, binding.shift === true)
      if (!seen.has(key)) {
        seen.add(key)
        continue
      }
      const replacement =
        fallback[rowId].find((candidate) => !seen.has(noteMapKey(candidate.code, candidate.shift === true))) ??
        fallback[rowId][i]!
      next[rowId][i] = { ...replacement }
      seen.add(noteMapKey(next[rowId][i]!.code, next[rowId][i]!.shift === true))
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
      const label = formatLayoutLabel(layoutMap.get(binding.code), true)
      if (label) binding.label = label
    }
  }
  return next
}

function buildExtendedBindings(layoutMap?: KeyboardLayoutMapLike): ComputerKeyboardBindingRows {
  const lower: ComputerKeyboardBinding[] = []
  const upper: ComputerKeyboardBinding[] = []
  let codeIndex = 0
  for (let pitch = EXTENDED_MIN_PITCH; pitch <= EXTENDED_MAX_PITCH; pitch++) {
    if (isBlackPitch(pitch)) continue
    const code = EXTENDED_WHITE_KEY_CODES[codeIndex++]
    if (!code) break
    const unshifted = getUnshiftedLabel(code, layoutMap)
    lower.push({
      code,
      label: unshifted,
      offset: pitch - DEFAULT_BASE_PITCH,
    })
    const blackPitch = pitch + 1
    if (blackPitch <= EXTENDED_MAX_PITCH && isBlackPitch(blackPitch)) {
      upper.push({
        code,
        label: getShiftedLabel(code, unshifted),
        offset: blackPitch - DEFAULT_BASE_PITCH,
        shift: true,
      })
    }
  }
  return { lower, upper }
}

function getUnshiftedLabel(code: string, layoutMap?: KeyboardLayoutMapLike): string {
  return formatLayoutLabel(layoutMap?.get(code), false) ?? fallbackKeyLabel(code, false)
}

function getShiftedLabel(code: string, unshifted: string): string {
  const korean = KOREAN_SHIFT_LABELS[unshifted]
  if (korean) return korean
  const symbol = getShiftSymbolLabels()[code] ?? DEFAULT_SHIFT_LABELS[code]
  if (symbol) return symbol
  const upper = unshifted.toLocaleUpperCase(getKeyboardLocale())
  return upper !== unshifted ? upper : `Shift+${unshifted}`
}

function getShiftSymbolLabels(): Record<string, string> {
  return getKeyboardLocale().toLowerCase().startsWith('tr')
    ? TURKISH_SHIFT_LABELS
    : DEFAULT_SHIFT_LABELS
}

function getKeyboardLocale(): string {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language || 'en'
}

function formatLayoutLabel(raw: string | undefined, uppercase: boolean): string | null {
  const value = raw?.trim()
  if (!value) return null
  if (value.length === 1) return uppercase ? value.toLocaleUpperCase(getKeyboardLocale()) : value
  return value.slice(0, 8)
}

function fallbackKeyLabel(code: string, shifted: boolean): string {
  if (shifted)
    return DEFAULT_SHIFT_LABELS[code] ?? fallbackKeyLabel(code, false).toLocaleUpperCase()
  const named: Record<string, string> = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
  }
  if (named[code]) return named[code]!
  if (code === 'KeyI' && getKeyboardLocale().toLowerCase().startsWith('tr')) return 'ı'
  if (code.startsWith('Key')) return code.slice(3).toLocaleLowerCase()
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

function isBlackPitch(pitch: number): boolean {
  return BLACK_PITCH_CLASSES.has(((pitch % 12) + 12) % 12)
}

function buildNoteMap(rows: ComputerKeyboardBindingRows): Map<string, number> {
  const noteMap = new Map<string, number>()
  for (const row of [rows.lower, rows.upper]) {
    for (const binding of row) {
      noteMap.set(noteMapKey(binding.code, binding.shift === true), binding.offset)
    }
  }
  return noteMap
}

function noteMapKey(code: string, shifted: boolean): string {
  return `${code}:${shifted ? 'shift' : 'base'}`
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
  private usesShiftBindings = false
  private shiftHeldKeysEnabled = true

  constructor(private readonly clock: MasterClock) {}

  setBindings(rows: ComputerKeyboardBindingRows): void {
    this.releaseAllHeld()
    this.bindings = cloneBindings(rows)
    this.noteMap = buildNoteMap(this.bindings)
    this.usesShiftBindings = rows.lower
      .concat(rows.upper)
      .some((binding) => binding.shift === true)
  }

  setShiftHeldKeysEnabled(enabled: boolean): void {
    if (!enabled) this.releaseShiftedHeldKeys()
    this.shiftHeldKeysEnabled = enabled
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
    if (this.isShiftKey(e.code)) {
      if (!this.usesShiftBindings || !this.shiftHeldKeysEnabled) return
      e.preventDefault()
      if (!e.repeat) this.pressShiftedHeldKeys()
      return
    }

    const shifted = this.usesShiftBindings && e.shiftKey
    const heldKey = noteMapKey(e.code, shifted)
    const offset = this.noteMap.get(heldKey)
    if (offset === undefined) return

    e.preventDefault()
    if (e.repeat) return
    if (this.held.has(heldKey)) return

    const pitch = 12 * (this.octave.value + 1) + offset
    if (pitch < 21 || pitch > 108) return

    this.held.set(heldKey, pitch)
    this.noteOn.set({ pitch, velocity: DEFAULT_VELOCITY, clockTime: this.clock.currentTime })
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && this.pedalHeld) {
      this.pedalHeld = false
      this.pedal.set(false)
      return
    }
    if (this.isShiftKey(e.code) && this.usesShiftBindings && this.shiftHeldKeysEnabled) {
      this.releaseShiftedHeldKeys()
      return
    }
    if (this.usesShiftBindings) {
      this.releaseHeldKey(noteMapKey(e.code, false))
      this.releaseHeldKey(noteMapKey(e.code, true))
      return
    }
    this.releaseHeldKey(noteMapKey(e.code, false))
  }

  private releaseHeldKey(key: string): void {
    const pitch = this.held.get(key)
    if (pitch === undefined) return
    this.held.delete(key)
    this.noteOff.set({ pitch, velocity: 0, clockTime: this.clock.currentTime })
  }

  private pressShiftedHeldKeys(): void {
    for (const key of Array.from(this.held.keys())) {
      if (!key.endsWith(':base')) continue
      const code = key.slice(0, -':base'.length)
      const shiftedKey = noteMapKey(code, true)
      if (this.held.has(shiftedKey)) continue
      const offset = this.noteMap.get(shiftedKey)
      if (offset === undefined) continue
      const pitch = 12 * (this.octave.value + 1) + offset
      if (pitch < 21 || pitch > 108) continue
      this.held.set(shiftedKey, pitch)
      this.noteOn.set({ pitch, velocity: DEFAULT_VELOCITY, clockTime: this.clock.currentTime })
    }
  }

  private releaseShiftedHeldKeys(): void {
    for (const key of Array.from(this.held.keys())) {
      if (key.endsWith(':shift')) this.releaseHeldKey(key)
    }
  }

  private isShiftKey(code: string): boolean {
    return code === 'ShiftLeft' || code === 'ShiftRight'
  }

  private shouldIgnore(e: KeyboardEvent): boolean {
    // Shift reserves letter keys for app-level hotkeys (Shift+R record,
    // Shift+L loop, etc.); without this guard the user would also trigger a
    // note via the FL-style key map whenever they hit a shortcut.
    if (e.ctrlKey || e.metaKey || e.altKey) return true
    if (e.shiftKey && !this.usesShiftBindings) return true
    const target = e.target as HTMLElement | null
    if (!target) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
  }

  dispose(): void {
    this.disable()
  }
}
