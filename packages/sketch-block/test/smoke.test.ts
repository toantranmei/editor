import { describe, expect, it } from 'vitest'
import { SKETCH_NODE } from '../src'

describe('smoke', () => {
  it('exports the node name', () => {
    expect(SKETCH_NODE).toBe('sketch')
  })
})
