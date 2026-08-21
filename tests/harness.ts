/**
 * A deliberately tiny assertion harness.
 *
 * These tests run in two different hosts — plain Node for the format
 * renderers, and a real Electron main process for the PDF — so the harness
 * has to work in both and cannot depend on a test runner's globals. It
 * collects results rather than printing directly, because Electron on Windows
 * does not attach its main process stdout to the parent console: the PDF
 * runner reads the collected report back out of a file instead.
 */
export interface TestReport {
  lines: string[]
  failures: number
}

export function createReport(): TestReport {
  return { lines: [], failures: 0 }
}

export function section(report: TestReport, name: string): void {
  report.lines.push('', `${name}:`)
}

export function note(report: TestReport, text: string): void {
  report.lines.push(`      ${text}`)
}

export function assert(report: TestReport, condition: boolean, label: string): void {
  report.lines.push(condition ? `  ok    ${label}` : `  FAIL  ${label}`)
  if (!condition) report.failures += 1
}

export function summarize(report: TestReport): string {
  const total = report.lines.filter((l) => l.startsWith('  ok') || l.startsWith('  FAIL')).length
  const tail = report.failures
    ? `\n${report.failures} of ${total} assertions FAILED`
    : `\nall ${total} assertions passed`
  return `${report.lines.join('\n')}\n${tail}`
}
