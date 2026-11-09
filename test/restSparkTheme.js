import { describe, it, expect } from 'vitest'
import { migrateMintTheme, MINT_COLOR } from '../app/utils/settingsTheme.js'

describe('mint theme compatibility', () => {
  for (const color of ['#478484', '#633738', '#ffffff', '#1D1F21', '#A49898', '#567890', '#123456']) {
    it(`backs up ${color}, preserves unrelated fields and is idempotent`, () => {
      const values = { mainColor: color, miniBreakColor: color, manual: { untouched: true }, microbreakDuration: 25000, transparentMode: true }
      const store = { get: key => values[key], set: patch => Object.assign(values, patch) }
      migrateMintTheme(store)
      expect(values.mainColor).toBe(MINT_COLOR)
      expect(values.miniBreakColor).toBe(MINT_COLOR)
      expect(values.settingsThemeBackup).toEqual({ mainColor: color, miniBreakColor: color })
      expect(values.manual).toEqual({ untouched: true })
      expect(values.microbreakDuration).toBe(25000)
      expect(values.transparentMode).toBe(true)
      const first = structuredClone(values)
      migrateMintTheme(store)
      expect(values).toEqual(first)
    })
  }
})
