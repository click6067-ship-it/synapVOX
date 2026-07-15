// Shared project display metadata. A project's group_id is a slug; map the known
// demo projects to their friendly topic name (fallback = the id itself). Kept in
// its own tiny module so the sidebar/dashboard can import `projectLabel` without
// pulling in the heavy GraphView (react-force-graph-2d) component.
const PROJECT_LABELS: Record<string, string> = { 'P-BIO': '딥러닝', 'P-LIFE': '생명과학', 'P-ML': '머신러닝' }

export function projectLabel(project: string): string {
  return PROJECT_LABELS[project] ?? project
}
