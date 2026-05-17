/**
 * When a file is uploaded to a featured project, we also mirror it into the
 * /misc gallery so the same asset is browsable both in the project context
 * and on its own. This helper builds the Misc item and POSTs it as an
 * `append` action to /api/misc.
 *
 * The mirror is a SEPARATE row in Misc — it points at the same Blob URL,
 * so storage is shared. Deleting the file from the project does NOT delete
 * the Misc mirror (or vice versa); both are user-managed independently
 * after creation.
 */

export type MiscMirrorParams = {
  /** Public URL of the uploaded asset (same Blob used by the project). */
  src: string
  /** Title for the Misc card — usually the project's client name. */
  title: string
  /** Year shown on the card. */
  year: string
  /** Mediums / tags chosen via the upload-time prompt. */
  medium: string[]
  /** Whether to render as a video or image card on /misc. */
  type: 'video' | 'image'
  /** Optional filename for delete bookkeeping in legacy paths. */
  fileName?: string
}

export async function mirrorToMisc(params: MiscMirrorParams): Promise<boolean> {
  try {
    const res = await fetch('/api/misc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'append',
        items: [
          {
            src: params.src,
            type: params.type,
            title: params.title,
            year: params.year,
            medium: params.medium.length > 0 ? params.medium : ['3D'],
            fileName: params.fileName,
          },
        ],
      }),
    })
    return res.ok
  } catch (err) {
    console.warn('Misc mirror failed (not fatal):', err)
    return false
  }
}
