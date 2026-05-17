/**
 * Browser-side helper for asking the server to delete one or more Blob URLs.
 *
 * Every admin delete / replace path used to leave the underlying file in Blob
 * storage forever. Now they all call this helper after the project / page
 * state update succeeds — fire-and-forget, so a failed cleanup doesn't undo
 * the primary action.
 *
 * Empty / non-URL inputs are filtered out; the route itself is tolerant of
 * blobs that no longer exist. Failures log a warning but never throw.
 */
export async function deleteBlobUrls(urls: Array<string | undefined | null>): Promise<void> {
  const targets = urls.filter((u): u is string => !!u && /^https?:\/\//.test(u))
  if (targets.length === 0) return
  try {
    await fetch('/api/blob-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: targets }),
    })
  } catch (err) {
    console.warn('Blob cleanup failed (not fatal):', err)
  }
}
