import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

const DEFAULT_ROOT = join(app.getPath('documents'), 'ChapterFlow')

let currentRoot = DEFAULT_ROOT

export function getProjectRoot(): string {
  return currentRoot
}

/** Called once at startup (after preferences load) and whenever the user opens a different project folder. */
export function setProjectRoot(root: string): void {
  currentRoot = root
}

export function getDefaultProjectRoot(): string {
  return DEFAULT_ROOT
}

export function projectExistsAt(root: string): boolean {
  return existsSync(join(root, 'binder.json'))
}
