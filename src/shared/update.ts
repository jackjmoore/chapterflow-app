/**
 * Update lifecycle as seen by the renderer.
 *
 * Each state is something the user is told about; there is deliberately no
 * state in which an update applies itself. 'available' and 'ready' both wait
 * for an explicit choice.
 */
export type UpdateStatus =
  | { state: 'idle'; version: string }
  | { state: 'checking'; version: string }
  | { state: 'up-to-date'; version: string; checkedAt: string }
  | {
      state: 'available'
      version: string
      newVersion: string
      releaseNotes: string | null
      releaseDate: string | null
    }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string; newVersion: string }
  | { state: 'error'; version: string; message: string }

export interface VersionInfo {
  version: string
  electron: string
  chrome: string
  node: string
  packaged: boolean
}
