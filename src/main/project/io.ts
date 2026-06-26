import { readFile, writeFile } from 'node:fs/promises'
import { ProjectSchema, type Project } from '@shared/schema'

/**
 * A `.aivp` project file is just the JSON-serialized Project, validated against
 * the schema on the way in and out so a corrupt or out-of-date file fails loudly
 * rather than producing a broken editor state.
 */
export async function loadProject(path: string): Promise<Project> {
  const raw = await readFile(path, 'utf8')
  const parsed = JSON.parse(raw)
  return ProjectSchema.parse(parsed)
}

export async function saveProject(path: string, project: Project): Promise<void> {
  const validated = ProjectSchema.parse(project)
  await writeFile(path, JSON.stringify(validated, null, 2), 'utf8')
}
