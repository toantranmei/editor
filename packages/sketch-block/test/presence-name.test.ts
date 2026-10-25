import { describe, expect, it } from 'vitest'
import { sanitizeName } from '../src/collab/presence'

describe('sanitizeName', () => {
  it('strips zero-width and invisible format characters', () => {
    expect(sanitizeName('A​n‌h‍⁠﻿')).toBe('Anh')
  })

  it('a name made only of invisible characters is empty (falls back to guest)', () => {
    expect(sanitizeName('​‌‍﻿')).toBe('')
  })

  it('keeps Vietnamese diacritics intact', () => {
    expect(sanitizeName('Trần Minh Ánh')).toBe('Trần Minh Ánh')
  })
})
