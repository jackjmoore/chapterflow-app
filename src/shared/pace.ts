const MS_PER_DAY = 1000 * 60 * 60 * 24

export interface PaceInfo {
  wordsRemaining: number
  daysRemaining: number
  requiredPace: number
  actualPace: number
  status: 'complete' | 'overdue' | 'ahead' | 'behind' | 'no-data'
}

function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / MS_PER_DAY)
}

/**
 * Plain, factual pace comparison — required words/day to hit the deadline vs.
 * the actual average words/day since target tracking began (startDate/startCount,
 * captured once the first time a project target/deadline is set). Returns null
 * when no target+deadline are configured, since there's nothing to compare.
 */
export function computePace(params: {
  currentTotal: number
  target: number | null
  deadline: string | null
  startDate: string | null
  startCount: number | null
  today?: Date
}): PaceInfo | null {
  const { currentTotal, target, deadline, startDate, startCount } = params
  if (target == null || !deadline) return null

  const today = params.today ?? new Date()
  const deadlineDate = new Date(`${deadline}T00:00:00`)
  const wordsRemaining = Math.max(0, target - currentTotal)

  if (currentTotal >= target) {
    return { wordsRemaining: 0, daysRemaining: daysBetween(today, deadlineDate), requiredPace: 0, actualPace: 0, status: 'complete' }
  }

  const daysRemaining = daysBetween(today, deadlineDate)
  const requiredPace = daysRemaining > 0 ? wordsRemaining / daysRemaining : wordsRemaining

  let actualPace = 0
  let hasData = false
  if (startDate && startCount != null) {
    const daysElapsed = Math.max(1, daysBetween(new Date(`${startDate}T00:00:00`), today))
    actualPace = Math.max(0, (currentTotal - startCount) / daysElapsed)
    hasData = true
  }

  if (daysRemaining <= 0) {
    return { wordsRemaining, daysRemaining, requiredPace, actualPace, status: 'overdue' }
  }
  if (!hasData) {
    return { wordsRemaining, daysRemaining, requiredPace, actualPace, status: 'no-data' }
  }
  return { wordsRemaining, daysRemaining, requiredPace, actualPace, status: actualPace >= requiredPace ? 'ahead' : 'behind' }
}
