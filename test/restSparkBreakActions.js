import { describe, expect, it } from 'vitest'
import { breakActions } from '../app/utils/breakActions.js'

describe('break actions', () => {
  it('allows both choices at the start of an ordinary break', () => {
    expect(breakActions(false, true, 0, 30)).toEqual({ postpone: true, skip: true })
  })

  it('preserves the strict postponement window and disallows skipping', () => {
    expect(breakActions(true, true, 0, 30)).toEqual({ postpone: true, skip: false })
    expect(breakActions(true, true, 30, 30)).toEqual({ postpone: false, skip: false })
  })

  it('keeps skip available after the postponement has been used', () => {
    expect(breakActions(false, false, 10, 30)).toEqual({ postpone: false, skip: true })
  })
})
