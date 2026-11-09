import { describe, it, expect, vi, afterEach } from 'vitest'
import VersionChecker from '../app/utils/versionChecker.js'

afterEach(() => vi.unstubAllGlobals())

describe('Rest Spark update source', () => {
  it('checks only the Fork and returns its published version', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ tag_name: 'v1.21.0' }), { status: 200 }))
    vi.stubGlobal('fetch', request)
    expect(await new VersionChecker().latest()).toBe('v1.21.0')
    expect(request.mock.calls[0][0]).toBe('https://api.github.com/repos/DeepCarry/RestSpark/releases/latest')
    expect(request).toHaveBeenCalledTimes(1)
  })
  for (const status of [404, 403, 500]) {
    it(`does not advertise an update for HTTP ${status}`, async () => {
      vi.stubGlobal('fetch', async () => new Response('{"tag_name":"v99.0.0"}', { status }))
      expect(await new VersionChecker().latest()).toBeUndefined()
    })
  }
  it('handles offline and malformed responses without falling back to upstream', async () => {
    const request = vi.fn(async () => { throw new Error('offline') })
    vi.stubGlobal('fetch', request)
    expect(await new VersionChecker().latest()).toBeUndefined()
    expect(request).toHaveBeenCalledTimes(1)
    vi.stubGlobal('fetch', async () => new Response('not json', { status: 200 }))
    expect(await new VersionChecker().latest()).toBeUndefined()
  })
})
