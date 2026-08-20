import { mkdir, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'

const writeQueues = new Map<string, Promise<void>>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientFsError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  // Windows in particular can transiently hold a brief lock on a file being
  // renamed over — most commonly a sync client (OneDrive, Dropbox) or an
  // antivirus scanner reading it at just the wrong moment. Worth a couple of
  // quick retries before treating it as a real failure.
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  const maxAttempts = 5
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      if (attempt === maxAttempts || !isTransientFsError(error)) throw error
      await sleep(50 * attempt)
    }
  }
}

async function writeNow(filePath: string, data: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await writeFile(tempPath, data, 'utf-8')
  await renameWithRetry(tempPath, filePath)
}

/**
 * Writes a file atomically (write to a temp file, then rename over the
 * target) so a crash mid-write never leaves a truncated/corrupt file.
 * Writes to the same path are queued so out-of-order completion can't
 * let a stale write clobber a newer one.
 */
export function atomicWrite(filePath: string, data: string): Promise<void> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve()
  const thisWrite = previous.then(
    () => writeNow(filePath, data),
    () => writeNow(filePath, data)
  )
  writeQueues.set(
    filePath,
    thisWrite.catch(() => undefined)
  )
  return thisWrite
}
