import { describe, expect, it } from 'vitest'
import { parseFocusAssertions } from '../app/utils/focusAssertions.js'

describe('macOS Focus state', () => {
  it('recognizes a valid active mode and an explicitly empty store', () => {
    const active = { assertionDetails: { assertionDetailsModeIdentifier: 'com.apple.donotdisturb.mode.default' } }
    expect(parseFocusAssertions({ data: [{ storeAssertionRecords: [active] }] })).toBe(true)
    expect(parseFocusAssertions({ data: [{ storeAssertionRecords: [] }] })).toBe(false)
  })

  it('reports an unknown schema without treating it as Focus off', () => {
    expect(parseFocusAssertions({ data: [{}] })).toBeNull()
    expect(parseFocusAssertions({ data: [{ storeAssertionRecords: [{}] }] })).toBeNull()
  })
})
