import { getDB, STORE_CACHE } from './db.js'
import { newId, validCover } from './repository.js'

// Cloud implementation of the repository seam (same shape as the IndexedDB one),
// backed by Supabase + row-level security. Photos ride along as base64 in a
// `photo` column (kept out of list payloads). The Discogs cache stays device-local.

const RECORD_COLS = 'id,album,artist,year,genre,notes,cover_url,cover_source,has_photo,label,catalog_no,tags,pressing,created_at,updated_at'
// Fallback select if the `pressing` column migration hasn't run yet — so a
// missed migration degrades to "no pressing data" instead of a blank collection.
const RECORD_COLS_BASE = 'id,album,artist,year,genre,notes,cover_url,cover_source,has_photo,label,catalog_no,tags,created_at,updated_at'
const missingPressing = (res) => res.error && /pressing/i.test(res.error.message || '')

const rowToRecord = (r) => ({
  id: r.id,
  album: r.album || '',
  artist: r.artist || '',
  year: r.year ?? null,
  genre: r.genre || '',
  notes: r.notes || '',
  coverUrl: r.cover_url || null,
  coverSource: r.cover_source || null,
  hasPhoto: Boolean(r.has_photo),
  label: r.label || '',
  catalogNo: r.catalog_no || '',
  tags: Array.isArray(r.tags) ? r.tags : [],
  pressing: r.pressing || null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

function recordToRow(rec, userId) {
  const now = Date.now()
  return {
    id: rec.id || newId(),
    user_id: userId,
    album: (rec.album || '').trim(),
    artist: (rec.artist || '').trim(),
    year: rec.year ? Number(rec.year) : null,
    genre: (rec.genre || '').trim(),
    notes: (rec.notes || '').trim(),
    cover_url: validCover(rec.coverUrl),
    cover_source: rec.coverSource || null,
    has_photo: Boolean(rec.hasPhoto),
    label: (rec.label || '').trim(),
    catalog_no: (rec.catalogNo || '').trim(),
    tags: Array.isArray(rec.tags) ? rec.tags.filter(Boolean) : [],
    pressing: rec.pressing ?? null,
    created_at: rec.createdAt || now,
    updated_at: now,
  }
}

// Partial update: map ONLY the keys present in the patch to their columns, so an
// edit like { coverSource: 'official' } never blanks album/artist/etc. (The local
// IndexedDB repo merges against the existing row; this achieves the same safely.)
const PATCH_COLS = {
  album: 'album', artist: 'artist', genre: 'genre', notes: 'notes',
  label: 'label', catalogNo: 'catalog_no', coverUrl: 'cover_url', coverSource: 'cover_source',
}
function patchToRow(patch) {
  const row = { updated_at: Date.now() }
  for (const [key, col] of Object.entries(PATCH_COLS)) {
    if (key in patch) row[col] = patch[key]
  }
  if ('year' in patch) row.year = patch.year ? Number(patch.year) : null
  if ('hasPhoto' in patch) row.has_photo = Boolean(patch.hasPhoto)
  if ('tags' in patch) row.tags = Array.isArray(patch.tags) ? patch.tags.filter(Boolean) : []
  if ('coverUrl' in patch) row.cover_url = validCover(patch.coverUrl)
  if ('pressing' in patch) row.pressing = patch.pressing ?? null
  return row
}

const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = reject
  r.readAsDataURL(blob)
})

export function createSupabaseRepository(supabase, userId) {
  const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data }

  return {
    async list() {
      let res = await supabase.from('records').select(RECORD_COLS).order('created_at', { ascending: true })
      if (missingPressing(res)) res = await supabase.from('records').select(RECORD_COLS_BASE).order('created_at', { ascending: true })
      return must(res).map(rowToRecord)
    },
    async get(id) {
      let res = await supabase.from('records').select(RECORD_COLS).eq('id', id).maybeSingle()
      if (missingPressing(res)) res = await supabase.from('records').select(RECORD_COLS_BASE).eq('id', id).maybeSingle()
      return res.data ? rowToRecord(res.data) : undefined
    },
    async add(record) {
      const data = must(await supabase.from('records').insert(recordToRow(record, userId)).select(RECORD_COLS).single())
      return rowToRecord(data)
    },
    async bulkAdd(records) {
      if (!records.length) return []
      const rows = records.map((r) => recordToRow(r, userId))
      // upsert (not insert) so re-importing a backup whose ids already exist
      // updates those rows instead of failing the whole atomic batch — matches
      // the local IndexedDB `put` semantics. RLS still scopes it to this user.
      const data = must(await supabase.from('records').upsert(rows, { onConflict: 'id' }).select(RECORD_COLS))
      return data.map(rowToRecord)
    },
    async update(id, patch) {
      const data = must(await supabase.from('records').update(patchToRow(patch)).eq('id', id).select(RECORD_COLS).single())
      return rowToRecord(data)
    },
    async remove(id) {
      must(await supabase.from('plays').delete().eq('record_id', id))
      must(await supabase.from('records').delete().eq('id', id))
    },

    // ---- personal photos (base64 in the photo column) ----
    async getPhoto(id) {
      const { data } = await supabase.from('records').select('photo').eq('id', id).maybeSingle()
      if (!data?.photo) return undefined
      try { return await (await fetch(data.photo)).blob() } catch { return undefined }
    },
    async setPhoto(id, blob) {
      // Photos ride in a DB column; cap size so a huge image can't bloat the row / fail the write.
      if (blob.size > 3 * 1024 * 1024) throw new Error('That photo is too large (max ~3 MB). Try a smaller image.')
      const dataUrl = await blobToDataURL(blob)
      must(await supabase.from('records').update({ photo: dataUrl, has_photo: true, updated_at: Date.now() }).eq('id', id))
    },
    async removePhoto(id) {
      must(await supabase.from('records').update({ photo: null, has_photo: false, cover_source: null, updated_at: Date.now() }).eq('id', id))
    },

    // ---- listening log ----
    async listPlays() {
      const data = must(await supabase.from('plays').select('id,record_id,played_at'))
      return data.map((p) => ({ id: p.id, recordId: p.record_id, playedAt: p.played_at }))
    },
    async logPlay(recordId, at) {
      const data = must(await supabase.from('plays').insert({ user_id: userId, record_id: recordId, played_at: at || Date.now() }).select('id,record_id,played_at').single())
      return { id: data.id, recordId: data.record_id, playedAt: data.played_at }
    },
    async removePlay(id) { must(await supabase.from('plays').delete().eq('id', id)) },

    // ---- wishlist ----
    async listWants() {
      const data = must(await supabase.from('wants').select('*').order('created_at', { ascending: true }))
      return data.map((w) => ({ id: w.id, album: w.album || '', artist: w.artist || '', year: w.year ?? null, genre: w.genre || '', notes: w.notes || '', coverUrl: w.cover_url || null, createdAt: w.created_at }))
    },
    async addWant(want) {
      const row = { id: want.id || newId(), user_id: userId, album: (want.album || '').trim(), artist: (want.artist || '').trim(), year: want.year ? Number(want.year) : null, genre: (want.genre || '').trim(), notes: (want.notes || '').trim(), cover_url: validCover(want.coverUrl), created_at: want.createdAt || Date.now() }
      const data = must(await supabase.from('wants').insert(row).select('*').single())
      return { id: data.id, album: data.album, artist: data.artist, year: data.year, genre: data.genre, notes: data.notes, coverUrl: data.cover_url, createdAt: data.created_at }
    },
    async updateWant(id, patch) {
      const row = {}
      if ('album' in patch) row.album = (patch.album || '').trim()
      if ('artist' in patch) row.artist = (patch.artist || '').trim()
      if ('year' in patch) row.year = patch.year ? Number(patch.year) : null
      if ('genre' in patch) row.genre = (patch.genre || '').trim()
      if ('notes' in patch) row.notes = (patch.notes || '').trim()
      if ('coverUrl' in patch) row.cover_url = validCover(patch.coverUrl)
      const data = must(await supabase.from('wants').update(row).eq('id', id).select('*').single())
      return { id: data.id, album: data.album, artist: data.artist, year: data.year, genre: data.genre, notes: data.notes, coverUrl: data.cover_url, createdAt: data.created_at }
    },
    async removeWant(id) { must(await supabase.from('wants').delete().eq('id', id)) },

    // ---- Discogs cache stays device-local (just a perf cache) ----
    async cacheGet(key) { return (await getDB()).get(STORE_CACHE, key) },
    async cacheSet(key, data) {
      const entry = { key, data, fetchedAt: Date.now() }
      await (await getDB()).put(STORE_CACHE, entry)
      return entry
    },

    async clear() {
      must(await supabase.from('plays').delete().eq('user_id', userId))
      must(await supabase.from('wants').delete().eq('user_id', userId))
      must(await supabase.from('records').delete().eq('user_id', userId))
    },

    // ---- friends (cloud-only social layer) ----
    friendsSupported: true,
    async myProfile() {
      let res = await supabase.from('profiles').select('share_notes,display_name,email,username').eq('id', userId).maybeSingle()
      if (res.error && /username/i.test(res.error.message || '')) {
        res = await supabase.from('profiles').select('share_notes,display_name,email').eq('id', userId).maybeSingle()
      }
      const d = res.data
      return {
        shareNotes: Boolean(d?.share_notes),
        displayName: d?.display_name || '',
        email: d?.email || '',
        username: d?.username || '',
      }
    },
    async setUsername(username) {
      // → 'ok' | 'invalid' | 'taken'
      return must(await supabase.rpc('set_username', { p_username: username }))
    },
    async searchUsers(query) {
      const data = must(await supabase.rpc('search_users', { p_query: query }))
      return (data || []).map((u) => ({ username: u.username })) // handle only — never id/email/name
    },
    async sendFriendRequestByUsername(username) {
      // → 'requested' | 'accepted' | 'already_friends' | 'already_pending' | 'not_found'
      return must(await supabase.rpc('send_friend_request_username', { p_username: username }))
    },
    async setShareNotes(value) {
      must(await supabase.from('profiles').update({ share_notes: Boolean(value) }).eq('id', userId))
    },
    async listFriends() {
      const data = must(await supabase.rpc('list_friends'))
      return (data || []).map((f) => ({
        friendshipId: f.friendship_id,
        otherId: f.other_id,
        name: f.other_name || f.other_username || (f.other_email || '').split('@')[0] || 'Friend',
        username: f.other_username || '',
        email: f.other_email || '',
        status: f.status,
        direction: f.direction, // 'friend' | 'incoming' | 'outgoing'
      }))
    },
    async sendFriendRequest(email) {
      // → 'requested' | 'accepted' | 'already_friends' | 'already_pending' | 'not_found'
      return must(await supabase.rpc('send_friend_request', { p_email: email }))
    },
    async respondFriendRequest(friendshipId, accept) {
      must(await supabase.rpc('respond_friend_request', { p_friendship_id: friendshipId, p_accept: Boolean(accept) }))
    },
    async removeFriend(otherId) {
      must(await supabase.rpc('remove_friend', { p_other_id: otherId }))
    },
    async friendRecords(ownerId) {
      const data = must(await supabase.rpc('get_friend_records', { p_owner: ownerId }))
      return (data || []).map(rowToRecord)
    },
    async friendPlays(ownerId) {
      const data = must(await supabase.rpc('get_friend_plays', { p_owner: ownerId }))
      return (data || []).map((p) => ({ id: p.id, recordId: p.record_id, playedAt: p.played_at }))
    },

    // ---- groups + "what everyone's spinning" feed ----
    async listGroups() {
      const data = must(await supabase.rpc('list_my_groups'))
      return (data || []).map((g) => ({ id: g.id, name: g.name, inviteCode: g.invite_code, memberCount: Number(g.member_count) || 0, isOwner: Boolean(g.is_owner) }))
    },
    async createGroup(name) {
      const g = (must(await supabase.rpc('create_group', { p_name: name })) || [])[0]
      return g ? { id: g.id, name: g.name, inviteCode: g.invite_code } : null
    },
    async joinGroup(code) {
      const g = (must(await supabase.rpc('join_group', { p_code: code })) || [])[0]
      return g ? { id: g.id, name: g.name } : null // null = no group with that code
    },
    async leaveGroup(groupId) { must(await supabase.rpc('leave_group', { p_gid: groupId })) },
    async groupMembers(groupId) {
      const data = must(await supabase.rpc('group_members_list', { p_gid: groupId }))
      return (data || []).map((m) => ({ id: m.user_id, username: m.username || '', name: m.display_name || m.username || 'Member' }))
    },
    async groupFeed(groupId) {
      const data = must(await supabase.rpc('group_feed', { p_gid: groupId }))
      return (data || []).map((f) => ({ userId: f.user_id, username: f.username || '', name: f.display_name || f.username || 'Someone', recordId: f.record_id, album: f.album || '', artist: f.artist || '', coverUrl: f.cover_url || null, playedAt: f.played_at }))
    },
  }
}
