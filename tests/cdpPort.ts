/**
 * Launches the built app for a CDP-driven suite and finds the DevTools port
 * Electron actually opened.
 *
 * The suites used to ask for a fixed port each (9345, 9347, 9359, 9367), so
 * two runs sharing a machine collided on whichever started second. Asking
 * for port 0 instead lets Chromium pick any free port, and it records the
 * choice in a DevToolsActivePort file inside the user-data directory: the
 * first line is the port. Every suite launches into its own temp user-data
 * directory, so reading that file is race-free by construction. There is
 * nothing to probe, allocate or reserve.
 *
 * Any stale file is removed before launching, because a suite that restarts
 * the app into the same directory (the dashboard does, four times) would
 * otherwise read the previous instance's port.
 */
import { spawn, type ChildProcess } from 'child_process'
import { rmSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { setTimeout as sleep } from 'timers/promises'

const PORT_FILE = 'DevToolsActivePort'

/** Starts `electron .` against the built app with a dynamically chosen
 *  DevTools port. Same spawn the suites always did, minus the fixed port. */
export function spawnApp(electronBinary: string, userDataDir: string, env: NodeJS.ProcessEnv): ChildProcess {
  rmSync(join(userDataDir, PORT_FILE), { force: true })
  return spawn(electronBinary, ['.', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env
  })
}

/** Resolves to the port Electron chose. The devtools endpoint is then
 *  http://127.0.0.1:<port>/json/list, exactly as before. */
export async function waitForDebugPort(
  child: ChildProcess,
  userDataDir: string,
  timeoutMs = 40_000
): Promise<number> {
  const portFile = join(userDataDir, PORT_FILE)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`app exited early (code ${child.exitCode}) before opening its devtools port`)
    }
    try {
      const port = Number((await readFile(portFile, 'utf-8')).split(/\r?\n/)[0])
      if (Number.isInteger(port) && port > 0) return port
    } catch {
      /* not written yet */
    }
    await sleep(200)
  }
  throw new Error(`app never wrote ${portFile} within ${timeoutMs}ms`)
}
