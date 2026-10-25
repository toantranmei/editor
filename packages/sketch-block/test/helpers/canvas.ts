import { vi } from 'vitest'

export interface Call { name: string; args: unknown[] }
export type FakeCtx = CanvasRenderingContext2D & { calls: Call[]; canvas: HTMLCanvasElement }

/** Recording fake 2D context: every method call is logged, property writes too. */
export function makeFakeCtx(canvas: HTMLCanvasElement): FakeCtx {
  const calls: Call[] = []
  const props: Record<string, unknown> = {
    calls, canvas, globalAlpha: 1, lineWidth: 1, strokeStyle: '#000', fillStyle: '#000',
  }
  return new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key]
      if (key === 'getLineDash') return () => []
      if (key === 'then') return undefined
      return (...args: unknown[]) => { calls.push({ name: key, args }) }
    },
    set(target, key: string, value) {
      target[key] = value
      calls.push({ name: `set:${key}`, args: [value] })
      return true
    },
  }) as unknown as FakeCtx
}

const ctxs = new WeakMap<HTMLCanvasElement, FakeCtx>()

export function ctxOf(c: HTMLCanvasElement): FakeCtx {
  let ctx = ctxs.get(c)
  if (!ctx) {
    ctx = makeFakeCtx(c)
    ctxs.set(c, ctx)
  }
  return ctx
}

/** Routes `HTMLCanvasElement.prototype.getContext` to recording fakes (restore with vi.restoreAllMocks). */
export function stubCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return ctxOf(this) as never
  } as never)
}

/** Manual requestAnimationFrame queue. */
export function stubFrames() {
  let frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return {
    flush() {
      const run = frames
      frames = []
      for (const cb of run) cb(0)
    },
    get pending() {
      return frames.length
    },
  }
}
