interface WelcomeScreenProps {
  onNewProject: () => void
  onOpenProject: () => void
}

function WelcomeScreen(props: WelcomeScreenProps): JSX.Element {
  const { onNewProject, onOpenProject } = props

  return (
    <div className="welcome-screen">
      <div className="welcome-card">
        <h1 className="welcome-title">ChapterFlow</h1>
        <p className="welcome-subtitle">A focused place to write.</p>
        <div className="welcome-actions">
          <button type="button" className="welcome-button welcome-button--primary" onClick={onNewProject}>
            New Project
          </button>
          <button type="button" className="welcome-button" onClick={onOpenProject}>
            Open Project…
          </button>
        </div>
      </div>
    </div>
  )
}

export default WelcomeScreen
