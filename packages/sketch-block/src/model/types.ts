export type ShapeType = 'rectangle' | 'ellipse' | 'diamond'
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'none'

export interface ElementBase {
  id: string
  type: ShapeType
  x: number
  y: number
  w: number
  h: number
  angle: number
  index: string
  stroke: string
  fill: string
  fillStyle: FillStyle
  strokeWidth: 1 | 2 | 4
  strokeStyle: 'solid' | 'dashed' | 'dotted'
  roughness: 0 | 1 | 2
  roundness: 'sharp' | 'round'
  opacity: number
  seed: number
  version: number
  locked: boolean
}

// Widened by later milestones (discriminated by `type`).
export type SketchElement = ElementBase

export type ElementPatch = Partial<Omit<SketchElement, 'id' | 'type' | 'version'>>

export const DEFAULT_STYLE: Pick<
  SketchElement,
  'stroke' | 'fill' | 'fillStyle' | 'strokeWidth' | 'strokeStyle' | 'roughness' | 'roundness' | 'opacity'
> = {
  stroke: '#1e1e1e',
  fill: 'transparent',
  fillStyle: 'hachure',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  roundness: 'round',
  opacity: 1,
}
