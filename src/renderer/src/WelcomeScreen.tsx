import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CHANGELOG } from '../../shared/changelog'
import { tickerFacts, type DashboardData } from '../../shared/dashboard'
import { randomSplash } from '../../shared/splashQuotes'
import { PlusIcon, TrashIcon } from './icons'
import { usePresence, presenceClass } from './usePresence'

interface WelcomeScreenProps {
  onNewProject: () => void
  onOpenProject: () => void
  onImport: () => void
  onImportScrivener: () => void
  /** Opens a known project by path; resolves false if it has since moved. */
  onOpenProjectAt: (path: string) => Promise<boolean>
}

/** Pixels a second the ticker pans. Slow enough to read a whole sentence as
 *  it passes — the duration itself is derived from this and the measured
 *  width, so the speed stays the same however much there is to say. */
const TICKER_SPEED = 18

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
 * The landing page.
 *
 * Shown before the editor on every launch — not only the first — unless the
 * writer has asked to go straight to their last project. It is the only place
 * that sees across projects rather than into one, which is why the lifetime
 * totals and the project list live here and nowhere else.
 *
 * The projects are the page: laid out as objects on a shelf rather than as
 * list rows, because picking one up is what this screen is for. Every number
 * lives in the ticker and nowhere else, which is what keeps this from
 * becoming a second Progress Tracker — that screen owns pace, targets,
 * per-document counts and the writing calendar in full.
 *
 * It performs no aggregation. Everything it shows is read from one small file
 * that the save and session paths keep current as a side effect of work they
 * were already doing.
 */
function WelcomeScreen(props: WelcomeScreenProps): JSX.Element {
  const { onNewProject, onOpenProject, onImport, onImportScrivener, onOpenProjectAt } = props

  const [data, setData] = useState<DashboardData | null>(null)
  const [skipOnLaunch, setSkipOnLaunch] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Both disclosures collapse to a link. Rendered through usePresence so the
  // body plays its exit rather than being unmounted out from under it.
  const changelog = usePresence(changelogOpen || null)
  const advanced = usePresence(advancedOpen || null)
  const [classicMode, setClassicMode] = useState(false)
  const versionClicks = useRef(0)

  // Chosen once per mount, so it does not change under the reader mid-visit.
  const splash = useMemo(() => randomSplash(), [])

  useEffect(() => {
    void window.api.getDashboardData().then(setData)
    void window.api.getSkipDashboardOnLaunch().then(setSkipOnLaunch)
    void window.api.getClassicMode().then(setClassicMode)
  }, [])

  const projects = data?.projects ?? []
  const facts = useMemo(() => (data ? tickerFacts(data.stats, data.projects) : []), [data])

  // --- the ticker's geometry -------------------------------------------
  //
  // Two measured values, both set as custom properties rather than hard-coded:
  //
  //   --ticker-start  puts the FIRST fact in the middle of the bar, so the
  //                   screen opens on a whole readable sentence instead of
  //                   whatever happened to be mid-pan. A delay in the CSS
  //                   holds it there before the pan begins.
  //   duration        derived from the track's real width, so the pan is a
  //                   constant slow speed however many facts there are — a
  //                   fixed duration would make a longer list read faster.
  const tickerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = useState<{ start: number; duration: number } | null>(null)

  useLayoutEffect(() => {
    const ticker = tickerRef.current
    const track = trackRef.current
    if (!ticker || !track || facts.length === 0) return

    const measure = (): void => {
      const first = track.querySelector('.welcome-ticker-item')
      if (!first) return
      const barWidth = ticker.clientWidth
      const firstWidth = first.getBoundingClientRect().width
      // Half the track, because the run is rendered twice for a seamless loop.
      const distance = track.scrollWidth / 2
      setGeometry({
        start: Math.max(0, (barWidth - firstWidth) / 2),
        duration: Math.max(1, Math.round(distance / TICKER_SPEED))
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(ticker)
    return () => observer.disconnect()
  }, [facts])

  async function toggleSkip(next: boolean): Promise<void> {
    setSkipOnLaunch(next)
    await window.api.setSkipDashboardOnLaunch(next)
  }

  // The run is rendered twice and the track panned exactly half its width,
  // which is what makes the loop seamless rather than snapping back.
  const tickerStyle = geometry
    ? ({
        '--ticker-start': `${geometry.start}px`,
        animationDuration: `${geometry.duration}s`
      } as CSSProperties)
    : undefined

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <header className="welcome-head">
          <h1 className="welcome-title">ChapterFlow</h1>
          <p className="welcome-splash">
            <span className="welcome-splash-text">“{splash.text}”</span>
            <cite className="welcome-splash-source">{splash.source}</cite>
          </p>
        </header>

        {facts.length > 0 && (
          <div className="welcome-ticker-wrap">
            <div className="welcome-ticker welcome-stat" ref={tickerRef}>
              <div className="welcome-ticker-track" ref={trackRef} style={tickerStyle}>
                {[0, 1].map((run) => (
                  <div className="welcome-ticker-run" key={run} aria-hidden={run === 1}>
                    {facts.map((fact) => (
                      <span className="welcome-ticker-item" key={`${run}-${fact}`}>
                        {fact}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Above the shelf, so someone arriving with work made elsewhere sees
            the way in before they see the (empty) shelf below it. */}
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
          <button type="button" className="welcome-button" onClick={onImportScrivener}>
            Import from Scrivener…
          </button>
        </div>

        {projects.length > 0 ? (
          <section className="welcome-section">
            <div className="welcome-shelf">
              {projects.map((project) => (
                <div key={project.path} className="welcome-project">
                  <button
                    type="button"
                    className="welcome-project-open"
                    onClick={() => void onOpenProjectAt(project.path)}
                    title={project.path}
                  >
                    <span className="welcome-project-name">{project.name}</span>
                    <span className="welcome-project-spacer" />
                    <span className="welcome-project-meta">
                      {project.words > 0 ? `${project.words.toLocaleString()} words` : 'Nothing written yet'}
                    </span>
                    <span className="welcome-project-opened">Opened {relativeDay(project.lastOpenedAt)}</span>
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
                </div>
              ))}
            </div>
          </section>
        ) : (
          data !== null && (
            <p className="welcome-empty">
              Start something, or bring across work you already have. Once a project is here it keeps its
              place on this shelf.
            </p>
          )
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
          {changelog.rendered && (
            <div className={`welcome-changelog ${presenceClass(changelog.visible)}`}>
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

        {advanced.rendered && (
          <div className={`welcome-advanced ${presenceClass(advanced.visible)}`}>
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
