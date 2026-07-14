// Pure slug derivation for a new project's group_id.
// Backend requires group_id to match [A-Za-z0-9_-]{1,64} (see gsvx/engine.py),
// so any title (incl. Korean/mixed text) must collapse to that charset, plus a
// short unique suffix so repeated submissions with the same/blank title don't collide.

function slugBase(title: string): string {
  const cleaned = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const truncated = cleaned.slice(0, 40).replace(/-+$/, '')
  return truncated || 'graph'
}

/** Derive a unique, backend-safe group_id from a (possibly empty/non-Latin) title. */
export function slugify(title: string, now: number = Date.now()): string {
  return `${slugBase(title)}-${now.toString(36)}`
}
