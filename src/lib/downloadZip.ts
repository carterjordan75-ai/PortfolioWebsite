/**
 * Fetch every file in `files`, zip them with jszip, and trigger a browser
 * download. Used by multiple admin panels (project editor "Download all",
 * misc panel bulk download, inline ProjectMediaPanel "Download selected").
 *
 * Files are added to a sub-folder named after `folderName`, with each entry
 * prefixed by its order index ("01_", "02_", …) so the receiver can see
 * which file was which slot in the admin list. Failures don't abort the
 * batch — missed files get a `__missing_N.txt` placeholder inside the zip
 * with the failed URL + error.
 *
 * `onProgress(done, total)` (optional) fires after each file completes so
 * the caller can render a progress indicator.
 */
export async function downloadAssetsZip(
  files: { name: string; url: string }[],
  folderName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (!files.length) return
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9.-]+/g, '_').replace(/^_+|_+$/g, '')
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const folderSafe = sanitize(folderName) || 'assets'
  const folder = zip.folder(folderSafe) ?? zip

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    try {
      const res = await fetch(f.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const seq = String(i + 1).padStart(2, '0')
      const rawName = f.name || f.url.split('/').pop() || `file_${seq}`
      folder.file(`${seq}_${sanitize(rawName)}`, blob)
    } catch (err) {
      console.error(`Failed to fetch ${f.url}:`, err)
      folder.file(`__missing_${i + 1}.txt`, `Failed to fetch: ${f.url}\nError: ${String(err)}\n`)
    }
    onProgress?.(i + 1, files.length)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = folderSafe + '.zip'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
