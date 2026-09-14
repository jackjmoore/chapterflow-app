/**
 * The `electron` module, as a Node-hosted suite sees it.
 *
 * `src/main/projectRoot.ts` computes its default root from `app.getPath` at
 * module load, so importing anything that reaches it — `documentStore`,
 * `binderStore`, the whole of `src/main/export` — throws under plain Node
 * before a single line of a test runs. That is the only thing standing
 * between the project-level txt/md/docx renderers and a Node host: none of
 * the three touches a BrowserWindow, and a compile of those formats never
 * calls one.
 *
 * So this stands in for the module at bundle time (`--alias:electron=` in
 * `test:build`), for that one suite. `getPath` returns a real temporary
 * directory because the value is a path, but nothing should ever read it: a
 * suite using this sets its own project root before it touches a store.
 * Everything else throws by name rather than being `undefined`, so a test
 * that strays onto a path genuinely needing Electron fails saying which call
 * it was, instead of "cannot read properties of undefined".
 */
import { tmpdir } from 'os'
import { join } from 'path'

function unavailable(name: string): (...args: unknown[]) => never {
  return () => {
    throw new Error(
      `electron.${name} is not available under the Node test host — this suite is for the paths that do not need Electron`
    )
  }
}

export const app = {
  getPath: (name: string): string => join(tmpdir(), `chapterflow-node-host-${name}`),
  getAppPath: (): string => process.cwd(),
  getName: (): string => 'chapterflow-app',
  getVersion: (): string => '0.0.0-node-host',
  on: unavailable('app.on'),
  once: unavailable('app.once'),
  whenReady: unavailable('app.whenReady'),
  quit: unavailable('app.quit')
}

export const BrowserWindow = unavailable('BrowserWindow')
export const ipcMain = { handle: unavailable('ipcMain.handle'), on: unavailable('ipcMain.on') }
export const dialog = {
  showSaveDialog: unavailable('dialog.showSaveDialog'),
  showOpenDialog: unavailable('dialog.showOpenDialog'),
  showMessageBox: unavailable('dialog.showMessageBox')
}
export const shell = { openPath: unavailable('shell.openPath'), showItemInFolder: unavailable('shell.showItemInFolder') }
export const nativeTheme = { shouldUseDarkColors: false }
export const clipboard = { writeText: unavailable('clipboard.writeText'), readText: unavailable('clipboard.readText') }
