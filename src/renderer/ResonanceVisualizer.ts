import { Container, Graphics } from 'pixi.js'
import type { Theme } from './theme'
import type { Viewport } from './viewport'

interface ResonancePulse {
  x: number
  y: number
  width: number
  color: number
  age: number
  life: number
  phase: number
  force: number
}

const MAX_PULSES = 180

export class ResonanceVisualizer {
  readonly container: Container

  private glow = new Graphics()
  private pulses: ResonancePulse[] = []

  constructor() {
    this.container = new Container()
    this.container.label = 'resonance-visualizer'
    this.container.blendMode = 'add'
    this.glow.label = 'resonance-glow'
    this.container.addChild(this.glow)
  }

  pulse(pitch: number, x: number, y: number, color: number, width: number, force = 1): void {
    if (this.pulses.length >= MAX_PULSES) this.pulses.shift()
    this.pulses.push({
      x,
      y,
      width: Math.max(8, width),
      color,
      age: 0,
      life: 1.8 + Math.random() * 0.9,
      phase: pitch * 0.31 + Math.random() * Math.PI,
      force,
    })
  }

  update(
    activeByPitch: ReadonlyMap<number, number>,
    viewport: Viewport,
    theme: Theme,
    dt: number,
    time: number,
  ): void {
    const g = this.glow
    g.clear()

    const { canvasWidth } = viewport.config
    const rollHeight = viewport.rollHeight
    if (rollHeight <= 0) return

    // A slow studio wash keeps the experimental branch visibly different even
    // before the first note lands.
    const breath = 0.5 + 0.5 * Math.sin(time * 0.45)
    g.rect(0, 0, canvasWidth, rollHeight)
    g.fill({ color: theme.nowLineGlow, alpha: 0.02 + breath * 0.014 })
    this.drawAmbientBands(g, viewport, theme, rollHeight, time)

    if (activeByPitch.size > 0) {
      this.drawActivePitchColumns(g, activeByPitch, viewport, rollHeight)
      this.drawChordBody(g, activeByPitch, viewport, rollHeight)
    }

    let i = this.pulses.length
    while (i--) {
      const pulse = this.pulses[i]!
      pulse.age += dt
      if (pulse.age >= pulse.life) {
        this.pulses[i] = this.pulses[this.pulses.length - 1]!
        this.pulses.pop()
        continue
      }
      this.drawPulse(g, pulse, rollHeight, time)
    }
  }

  clear(): void {
    this.pulses = []
    this.glow.clear()
  }

  private drawAmbientBands(
    g: Graphics,
    viewport: Viewport,
    theme: Theme,
    rollHeight: number,
    time: number,
  ): void {
    const { canvasWidth } = viewport.config
    const colors = theme.trackColors.length > 0 ? theme.trackColors : [theme.nowLineGlow]
    for (let i = 0; i < 4; i++) {
      const phase = time * (0.18 + i * 0.045) + i * 1.7
      const bandHeight = 34 + i * 9
      const y = rollHeight * (0.16 + i * 0.19) + Math.sin(phase) * 18 - bandHeight / 2
      const width = canvasWidth * (0.86 + i * 0.1)
      const x = canvasWidth * 0.07 - Math.sin(phase * 0.7) * 42

      g.roundRect(x, y, width, bandHeight, bandHeight / 2)
      g.fill({
        color: colors[i % colors.length]!,
        alpha: 0.016 + 0.008 * Math.sin(phase + 0.6),
      })
    }
  }

  private drawActivePitchColumns(
    g: Graphics,
    activeByPitch: ReadonlyMap<number, number>,
    viewport: Viewport,
    rollHeight: number,
  ): void {
    for (const [pitch, color] of activeByPitch) {
      const width = viewport.pitchWidth(pitch)
      if (width <= 0) continue
      const cx = viewport.pitchToX(pitch) + width / 2
      const columnW = Math.max(18, width * 2.6)
      const coreW = Math.max(2, width * 0.22)

      g.roundRect(cx - columnW / 2, 0, columnW, rollHeight, columnW / 2)
      g.fill({ color, alpha: 0.055 })
      g.roundRect(cx - coreW / 2, 0, coreW, rollHeight, coreW / 2)
      g.fill({ color, alpha: 0.11 })
    }
  }

  private drawChordBody(
    g: Graphics,
    activeByPitch: ReadonlyMap<number, number>,
    viewport: Viewport,
    rollHeight: number,
  ): void {
    if (activeByPitch.size < 2) return
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let color = 0xffffff
    for (const [pitch, pitchColor] of activeByPitch) {
      const width = viewport.pitchWidth(pitch)
      if (width <= 0) continue
      const cx = viewport.pitchToX(pitch) + width / 2
      minX = Math.min(minX, cx)
      maxX = Math.max(maxX, cx)
      color = pitchColor
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return

    const x = Math.max(0, minX - 28)
    const w = Math.min(viewport.config.canvasWidth - x, maxX - minX + 56)
    const y = Math.max(0, rollHeight - 190)
    const h = Math.min(160, rollHeight - y)

    g.roundRect(x, y, w, h, 22)
    g.fill({ color, alpha: 0.075 })
    g.rect(x, rollHeight - 2, w, 2)
    g.fill({ color, alpha: 0.2 })
  }

  private drawPulse(g: Graphics, pulse: ResonancePulse, rollHeight: number, time: number): void {
    const u = pulse.age / pulse.life
    const fade = (1 - u) * (1 - u)
    const rise = u * Math.min(180, rollHeight * 0.42)
    const shimmer = 0.92 + 0.08 * Math.sin(time * 5.2 + pulse.phase)
    const width = pulse.width * (2.4 + u * 8.5) * pulse.force
    const height = 18 + u * 110
    const y = pulse.y - rise - height / 2

    g.roundRect(pulse.x - width / 2, y, width, height, height / 2)
    g.fill({ color: pulse.color, alpha: 0.22 * fade * shimmer })

    const lineWidth = pulse.width * (1.5 + u * 6.5)
    g.rect(pulse.x - lineWidth / 2, Math.min(pulse.y - rise, rollHeight - 2), lineWidth, 1.5)
    g.fill({ color: pulse.color, alpha: 0.38 * fade })
  }
}
