import { describe, it, expect, beforeEach } from 'vitest'
import { validCover, newId, getRepository } from '../src/data/repository.js'
import { pressingVerdict, rarityLabel } from '../src/services/discogs.js'

describe('validCover', () => {
  it('accepts image-bearing schemes', () => {
    expect(validCover('https://x/a.jpg')).toBe('https://x/a.jpg')
    expect(validCover('http://x/a.png')).toBeTruthy()
    expect(validCover('data:image/png;base64,AAAA')).toBeTruthy()
    expect(validCover('blob:abc')).toBeTruthy()
  })
  it('rejects dangerous / non-image values', () => {
    expect(validCover('javascript:alert(1)')).toBe(null)
    expect(validCover('data:text/html,<script>')).toBe(null)
    expect(validCover(42)).toBe(null)
    expect(validCover('')).toBe(null)
    expect(validCover(null)).toBe(null)
  })
})

describe('newId', () => {
  it('is a valid v4 UUID', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})

describe('pressingVerdict', () => {
  it('original when pressing year matches the master year', () => {
    expect(pressingVerdict({ year: 1973, masterYear: 1973 }).kind).toBe('original')
  })
  it('reissue when later than the original', () => {
    const v = pressingVerdict({ year: 1984, masterYear: 1973 })
    expect(v.kind).toBe('reissue')
    expect(v.originalYear).toBe(1973)
    expect(v.pressingYear).toBe(1984)
  })
  it('unknown without enough data', () => {
    expect(pressingVerdict({ year: null, masterYear: 1973 }).kind).toBe('unknown')
    expect(pressingVerdict({}).kind).toBe('unknown')
  })
})

describe('rarityLabel', () => {
  it('returns null when a count is missing', () => {
    expect(rarityLabel(null, 5)).toBe(null)
    expect(rarityLabel(5, null)).toBe(null)
  })
  it('flags wanted-but-none-owned as highly sought', () => {
    expect(rarityLabel(0, 10)).toBe('Highly sought after')
    expect(rarityLabel(0, 0)).toBe(null)
  })
  it('reads common when owned far exceeds wanted', () => {
    expect(rarityLabel(100, 5)).toBe('Common')
  })
})

describe('IndexedDB repository round-trip', () => {
  beforeEach(async () => { await getRepository().clear() })

  it('normalizes messy input on add (year, cover, tags, pressing, id)', async () => {
    const repo = getRepository()
    const rec = await repo.add({
      album: '  Kind of Blue ', artist: 'Miles Davis', year: '1959',
      coverUrl: 'javascript:bad', tags: ['jazz', '', '  '], pressing: { isOriginal: true },
    })
    expect(rec.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(rec.album).toBe('Kind of Blue')   // trimmed
    expect(rec.year).toBe(1959)              // coerced to a number
    expect(rec.coverUrl).toBe(null)          // dangerous scheme rejected
    expect(rec.tags).toEqual(['jazz'])       // blank tags filtered
    expect(rec.pressing).toEqual({ isOriginal: true })
    const got = await repo.get(rec.id)
    expect(got.album).toBe('Kind of Blue')
  })

  it('partial update preserves untouched fields', async () => {
    const repo = getRepository()
    const rec = await repo.add({ album: 'Aja', artist: 'Steely Dan', year: 1977 })
    const upd = await repo.update(rec.id, { coverSource: 'official' })
    expect(upd.album).toBe('Aja')
    expect(upd.artist).toBe('Steely Dan')
    expect(upd.year).toBe(1977)
    expect(upd.coverSource).toBe('official')
  })

  it('bulkAdd then list returns every record', async () => {
    const repo = getRepository()
    await repo.bulkAdd([{ album: 'A', artist: 'X' }, { album: 'B', artist: 'Y' }])
    expect((await repo.list()).length).toBe(2)
  })
})
