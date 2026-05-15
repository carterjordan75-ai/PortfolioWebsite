import { redirect } from 'next/navigation'

// The main page content moved to `/` — keep this route as a permanent redirect
// so any older bookmarks or external links to /work still land in the right place.
export default function WorkRedirect() {
  redirect('/')
}
