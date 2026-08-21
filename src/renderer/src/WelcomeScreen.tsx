import { useEffect, useMemo, useRef, useState } from 'react'
import { CHANGELOG } from '../../shared/changelog'
import { statPhrasings, type DashboardData } from '../../shared/dashboard'
import { DocumentIcon, PlusIcon, TrashIcon } from './icons'

interface WelcomeScreenProps {
  onNewProject: () => void
  onOpenProject: () => void
  onImport: () => void
  /** Opens a known project by path; resolves false if it has since moved. */
  onOpenProjectAt: (path: string) => Promise<boolean>
}

/** How long each phrasing of the lifetime stat holds before the next. */
const STAT_ROTATE_MS = 5000

function relativeDay(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * The dashboard.
 *
 * Shown before the editor on every launch — not only the first — unless the
 * writer has asked to go straight to their last project. It is the only place
 * that sees across projects rather than into one, which is why the lifetime
 * totals and the project list live here and nowhere else.
 *
 * It performs no aggregation. Everything it shows is read from one small file
 * that the save and session paths keep current as a side effect of work they
 * were already doing.
 */
function WelcomeScreen(props: WelcomeScreenProps): JSX.Element {
  const { onNewProject, onOpenProject, onImport, onOpenProjectAt } = props

  const [data, setData] = useState<DashboardData | null>(null)
  const [skipOnLaunch, setSkipOnLaunch] = useState(false)
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [classicMode, setClassicMode] = useState(false)
  const versionClicks = useRef(0)

  useEffect(() => {
    void window.api.getDashboardData().then(setData)
    void window.api.getSkipDashboardOnLaunch().then(setSkipOnLaunch)
    void window.api.getClassicMode().then(setClassicMode)
  }, [])

  const phrases = useMemo(() => (data ? statPhrasings(data.stats) : []), [data])

  // One line at a time, in turn. Nothing rotates until there is more than one
  // thing to say, so a fresh install shows a single steady line rather than
  // blinking between two ways of saying nothing.
  useEffect(() => {
    if (phrases.length < 2) return
    const timer = setInterval(() => setPhraseIndex((i) => (i + 1) % phrases.length), STAT_ROTATE_MS)
    return () => clearInterval(timer)
  }, [phrases.length])

  async function toggleSkip(next: boolean): Promise<void> {
    setSkipOnLaunch(next)
    await window.api.setSkipDashboardOnLaunch(next)
  }

  const projects = data?.projects ?? []

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <header className="welcome-head">
          <h1 className="welcome-title">ChapterFlow</h1>
          {phrases.length > 0 ? (
            <p className="welcome-stat" key={phraseIndex}>
              {phrases[phraseIndex % phrases.length]}
            </p>
          ) : (
            <p className="welcome-subtitle">A focused place to write.</p>
          )}
        </header>

        <div className="welcome-actions">
          <button type="button" className="welcome-button welcome-button--primary" onClick={onNewProject}>
            <PlusIcon /> New Project
          </button>
          <button type="button" className="welcome-button" onClick={onOpenProject}>
            Open Project…
          </button>
          <button type="button" className="welcome-button" onClick={onImport}>
            Import…
          </button>
        </div>

        {projects.length > 0 && (
          <section className="welcome-section">
            <h2 className="welcome-section-title">Recent projects</h2>
            <ul className="welcome-projects">
              {projects.map((project) => (
                <li key={project.path} className="welcome-project">
                  <button
                    type="button"
                    className="welcome-project-open"
                    onClick={() => void onOpenProjectAt(project.path)}
                    title={project.path}
                  >
                    <DocumentIcon />
                    <span className="welcome-project-name">{project.name}</span>
                    <span className="welcome-project-meta">
                      {project.words > 0 ? `${project.words.toLocaleString()} words · ` : ''}
                      {relativeDay(project.lastOpenedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="welcome-project-forget"
                    title="Remove from this list. The project itself is not deleted."
                    onClick={() => {
                      void window.api.forgetProject(project.path).then(() => {
                        setData((current) =>
                          current
                            ? { ...current, projects: current.projects.filter((p) => p.path !== project.path) }
                            : current
                        )
                      })
                    }}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="welcome-section">
          <button
            type="button"
            className="welcome-changelog-toggle"
            aria-expanded={changelogOpen}
            onClick={() => setChangelogOpen((v) => !v)}
          >
            <span className="welcome-changelog-caret">{changelogOpen ? '▼' : '▶'}</span>
            What&apos;s new in {CHANGELOG[0]?.version}
          </button>
          {changelogOpen && (
            <div className="welcome-changelog">
              {CHANGELOG.map((entry) => (
                <div key={entry.version} className="welcome-changelog-entry">
                  <div className="welcome-changelog-version">
                    {entry.version}
                    <span className="welcome-changelog-date">{new Date(entry.date).toLocaleDateString()}</span>
                  </div>
                  <ul>
                    {entry.changes.map((change, i) => (
                      <li key={i}>{change}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="welcome-footer">
          <label className="welcome-skip">
            <input type="checkbox" checked={skipOnLaunch} onChange={(e) => void toggleSkip(e.target.checked)} />
            Skip this and open my last project
          </label>

          {/* Deliberately unlabelled until asked for: three presses on the
              version number. The alternative skin is not built yet — this
              reserves its home and remembers the choice. */}
          <button
            type="button"
            className="welcome-version"
            onClick={() => {
              versionClicks.current += 1
              if (versionClicks.current >= 3) setAdvancedOpen(true)
            }}
          >
            {CHANGELOG[0]?.version}
          </button>
        </footer>

        {advancedOpen && (
          <div className="welcome-advanced">
            <label className="welcome-skip">
              <input
                type="checkbox"
                checked={classicMode}
                onChange={(e) => {
                  setClassicMode(e.target.checked)
                  void window.api.setClassicMode(e.target.checked)
                }}
              />
              Classic mode
            </label>
            <span className="welcome-advanced-note">Not yet available — the setting is remembered for when it is.</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default WelcomeScreen
