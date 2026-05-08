import { createSignal, For } from 'solid-js'
import { render } from 'solid-js/web'
import { isNarrowViewport } from './utils'

export interface KeyboardRangeOption {
  keyCount: number
  name: string
}

interface TriggerProps {
  label: () => string
  isOpen: () => boolean
  onToggle: () => void
  registerEl: (el: HTMLButtonElement) => void
}

function TriggerView(props: TriggerProps) {
  return (
    <button
      ref={(el) => props.registerEl(el)}
      class="ts-pill ts-pill--key-range"
      classList={{ 'ts-pill--open': props.isOpen() }}
      id="ts-key-range"
      type="button"
      aria-label="Keyboard range"
      title="Keyboard range"
      onClick={() => props.onToggle()}
    >
      <span class="ts-key-range-label">{props.label()}</span>
    </button>
  )
}

interface MenuProps {
  options: readonly KeyboardRangeOption[]
  current: () => number
  isOpen: () => boolean
  isSheet: () => boolean
  onSelect: (count: number) => void
  registerEl: (el: HTMLElement) => void
}

function MenuView(props: MenuProps) {
  return (
    <div
      ref={(el) => props.registerEl(el)}
      class="ts-popover ts-key-range-menu"
      classList={{
        'ts-popover--open': props.isOpen(),
        'popover--sheet': props.isSheet(),
      }}
    >
      <div class="panel-header">
        <span class="panel-label">Keys</span>
      </div>
      <div class="key-range-items">
        <For each={props.options}>
          {(opt) => (
            <button
              class="key-range-item"
              classList={{ 'key-range-item--on': props.current() === opt.keyCount }}
              type="button"
              onClick={() => props.onSelect(opt.keyCount)}
            >
              <span class="key-range-item-count">{opt.keyCount}</span>
              <span class="key-range-item-name">{opt.name}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

export class KeyboardRangeMenu {
  readonly trigger!: HTMLButtonElement
  private menu!: HTMLElement
  private isOpen = false
  private disposeTrigger: (() => void) | null = null
  private disposeMenu: (() => void) | null = null
  private menuWrapper: HTMLDivElement | null = null
  private triggerWrapper: HTMLDivElement | null = null

  private readonly writeCurrent: (v: number) => void
  private readonly setIsOpen: (v: boolean) => void
  private readonly setIsSheet: (v: boolean) => void

  onSelect?: (keyCount: number) => void

  private onDocPointer = (e: PointerEvent): void => {
    const target = e.target as Node
    if (this.menu.contains(target)) return
    if (this.trigger.contains(target)) return
    this.close()
  }
  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isOpen) this.close()
  }
  private onResize = (): void => {
    if (!this.isOpen) return
    if (this.menu.classList.contains('popover--sheet') || isNarrowViewport()) {
      this.close()
      return
    }
    this.positionAbove()
  }

  constructor(
    triggerHost: HTMLElement,
    popoverHost: HTMLElement,
    private options: readonly KeyboardRangeOption[],
    initial: number,
  ) {
    const [current, setCurrent] = createSignal(initial)
    const [isOpen, setIsOpen] = createSignal(false)
    const [isSheet, setIsSheet] = createSignal(false)

    this.writeCurrent = setCurrent
    this.setIsOpen = setIsOpen
    this.setIsSheet = setIsSheet

    const label = (): string => String(current())

    const triggerWrapper = document.createElement('div')
    triggerWrapper.style.display = 'contents'
    triggerHost.appendChild(triggerWrapper)
    this.triggerWrapper = triggerWrapper
    let triggerEl!: HTMLButtonElement
    this.disposeTrigger = render(
      () => (
        <TriggerView
          label={label}
          isOpen={isOpen}
          onToggle={() => this.toggle()}
          registerEl={(el) => {
            triggerEl = el
          }}
        />
      ),
      triggerWrapper,
    )
    ;(this as { trigger: HTMLButtonElement }).trigger = triggerEl

    const menuWrapper = document.createElement('div')
    popoverHost.appendChild(menuWrapper)
    this.menuWrapper = menuWrapper
    this.disposeMenu = render(
      () => (
        <MenuView
          options={options}
          current={current}
          isOpen={isOpen}
          isSheet={isSheet}
          onSelect={(keyCount) => {
            this.writeCurrent(keyCount)
            this.close()
            this.onSelect?.(keyCount)
          }}
          registerEl={(el) => {
            this.menu = el
          }}
        />
      ),
      menuWrapper,
    )
  }

  setCurrent(keyCount: number): void {
    this.writeCurrent(keyCount)
  }

  private toggle(): void {
    this.isOpen ? this.close() : this.open()
  }

  private open(): void {
    if (this.isOpen) return
    this.isOpen = true
    this.setIsOpen(true)
    if (isNarrowViewport()) {
      this.setIsSheet(true)
      this.menu.style.top = ''
      this.menu.style.right = ''
      this.menu.style.left = ''
    } else {
      this.setIsSheet(false)
      this.positionAbove()
    }
    setTimeout(() => {
      document.addEventListener('pointerdown', this.onDocPointer)
      document.addEventListener('keydown', this.onKey)
      window.addEventListener('resize', this.onResize)
    }, 0)
  }

  private close(): void {
    if (!this.isOpen) return
    this.isOpen = false
    this.setIsOpen(false)
    this.setIsSheet(false)
    document.removeEventListener('pointerdown', this.onDocPointer)
    document.removeEventListener('keydown', this.onKey)
    window.removeEventListener('resize', this.onResize)
  }

  private positionAbove(): void {
    const rect = this.trigger.getBoundingClientRect()
    const menuW = this.menu.offsetWidth || 220
    const menuH = this.menu.offsetHeight || 300
    const right = Math.max(12, window.innerWidth - rect.right)
    const top = Math.max(12, rect.top - menuH - 8)
    this.menu.style.right = `${right}px`
    this.menu.style.top = `${top}px`
    this.menu.style.left = ''
    const desiredLeft = window.innerWidth - right - menuW
    if (desiredLeft < 12)
      this.menu.style.right = `${Math.max(12, window.innerWidth - menuW - 12)}px`
  }

  dispose(): void {
    this.close()
    this.disposeTrigger?.()
    this.disposeMenu?.()
    this.disposeTrigger = null
    this.disposeMenu = null
    this.triggerWrapper?.remove()
    this.menuWrapper?.remove()
    this.triggerWrapper = null
    this.menuWrapper = null
  }
}
