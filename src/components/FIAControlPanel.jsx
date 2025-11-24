const penaltyOptions = [
  { label: '5s', value: '5s', title: 'Issue a 5 second time penalty' },
  { label: '10s', value: '10s', title: 'Issue a 10 second time penalty' },
  { label: 'Drive-Through', value: 'Drive-Through', title: 'Force a drive-through penalty', variant: 'warning' },
  { label: 'Stop & Go', value: 'Stop&Go', title: 'Require a stop/go penalty', variant: 'warning' },
  { label: 'DQ', value: 'DQ', title: 'Disqualify the car from the race', variant: 'danger', requiresConfirm: true }
];

const flagOptions = [
  { label: 'Green', value: 'green', title: 'Track clear – resume racing', variant: 'success' },
  { label: 'Yellow', value: 'yellow', title: 'Local caution – reduce speed', variant: 'warning' },
  { label: 'Red', value: 'red', title: 'Session stopped – all cars to pit lane', variant: 'danger', requiresConfirm: true },
  { label: 'Blue', value: 'blue', title: 'Blue flag – faster car approaching', variant: 'info' },
  { label: 'Black', value: 'black', title: 'Black flag – summon driver to pits', variant: 'danger' },
  { label: 'Meatball', value: 'meatball', title: 'Black/Orange – mechanical issue warning', variant: 'warning' }
];

const getButtonClass = (variant, active) => {
  const classes = ['fia-button'];
  if (variant) classes.push(`fia-button--${variant}`);
  if (active) classes.push('is-active');
  return classes.join(' ');
};

const FIAControlPanel = ({ directorState, raceDirector }) => {
  if (!raceDirector || !directorState) return null;

  const adminState = directorState.admin || {};
  const raceLocked = directorState.isAborted;

  const status = directorState.isAborted
    ? { label: 'Aborted', tone: 'danger' }
    : directorState.isPaused
      ? { label: 'Paused', tone: 'warning' }
      : { label: 'Live', tone: 'success' };

  const handlePenalty = penalty => {
    if (raceLocked) return;
    const shouldProceed = penalty === 'DQ'
      ? window.confirm('Confirm disqualification? This action cannot be undone.')
      : true;
    if (!shouldProceed) return;
    raceDirector.dispatch('ISSUE_PENALTY', { penalty });
  };

  const handleFlag = flag => {
    const needsConfirmation = flag === 'red'
      ? window.confirm('Deploy red flag and stop the race?')
      : true;
    if (!needsConfirmation) return;
    raceDirector.dispatch('SET_FLAG', { flag });
  };

  const handleSafety = action => {
    if (action === 'ABORT' && !window.confirm('Abort the race and neutralize all sessions?')) return;
    raceDirector.dispatch('SAFETY_ACTION', { action });
  };

  const handleAdmin = action => {
    raceDirector.dispatch('ADMIN_ACTION', { action });
  };

  const isFlagDisabled = flag => {
    if (raceLocked) return true;
    if (flag === directorState.currentFlag) return true;
    if (flag === 'blue' && directorState.currentFlag === 'red') return true;
    return false;
  };

  const scActive = directorState.safetyMode === 'SC';
  const vscActive = directorState.safetyMode === 'VSC';

  const scDisabled = raceLocked || (directorState.safetyMode !== 'none' && !scActive);
  const vscDisabled = raceLocked || (directorState.safetyMode !== 'none' && !vscActive);
  const pauseDisabled = raceLocked;
  const abortDisabled = directorState.isAborted;

  const adminDisabled = raceLocked;

  const adminControls = [
    {
      key: 'startReleasesOpen',
      action: 'START_RELEASES',
      label: adminState.startReleasesOpen ? 'Close Releases' : 'Start Releases',
      title: adminState.startReleasesOpen ? 'Close release system' : 'Authorize race start releases',
      active: adminState.startReleasesOpen
    },
    {
      key: 'techReviewActive',
      action: 'TECH_REVIEW',
      label: adminState.techReviewActive ? 'Clear Tech Review' : 'Tech Infraction Review',
      title: 'Toggle technical infraction review status',
      active: adminState.techReviewActive
    },
    {
      key: 'parcFermeLocked',
      action: 'PARC_FERME',
      label: adminState.parcFermeLocked ? 'Open Parc Fermé' : 'Lock Parc Fermé',
      title: 'Toggle parc fermé enforcement',
      active: adminState.parcFermeLocked
    },
    {
      key: 'protestPending',
      action: 'PROTEST',
      label: adminState.protestPending ? 'Resolve Protest' : 'Protest Resolution',
      title: 'Manage protest resolution workflow',
      active: adminState.protestPending
    }
  ];

  return (
    <div className="fia-panel">
      <div className="fia-panel__header">
        <div>
          <div className="group-title">FIA Control</div>
          <div className="fia-panel__title">Race Director</div>
        </div>
        <span className={`status-pill status-pill--${status.tone}`} title={`Race status: ${status.label}`}>
          {status.label}
        </span>
      </div>

      <div className="fia-group">
        <div className="group-title">Penalties</div>
        <div className="button-grid">
          {penaltyOptions.map(option => (
            <button
              key={option.value}
              type="button"
              className={getButtonClass(option.variant, false)}
              title={option.title}
              disabled={raceLocked}
              onClick={() => {
                if (raceLocked) return;
                handlePenalty(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fia-group">
        <div className="group-title">Flags</div>
        <div className="button-grid">
          {flagOptions.map(option => (
            <button
              key={option.value}
              type="button"
              className={getButtonClass(option.variant, directorState.currentFlag === option.value)}
              title={option.title}
              disabled={isFlagDisabled(option.value)}
              onClick={() => {
                if (isFlagDisabled(option.value)) return;
                handleFlag(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fia-group">
        <div className="group-title">Safety</div>
        <div className="button-grid">
          <button
            type="button"
            className={getButtonClass('info', scActive)}
            title={scActive ? 'Recall the physical safety car' : 'Deploy the safety car'}
            disabled={scDisabled}
            onClick={() => {
              if (scDisabled) return;
              handleSafety('SC');
            }}
          >
            {scActive ? 'Recall SC' : 'Deploy SC'}
          </button>
          <button
            type="button"
            className={getButtonClass('info', vscActive)}
            title={vscActive ? 'End the virtual safety car' : 'Deploy the virtual safety car'}
            disabled={vscDisabled}
            onClick={() => {
              if (vscDisabled) return;
              handleSafety('VSC');
            }}
          >
            {vscActive ? 'End VSC' : 'Deploy VSC'}
          </button>
          <button
            type="button"
            className={getButtonClass('warning', directorState.isPaused)}
            title={directorState.isPaused ? 'Resume the timing loop' : 'Freeze the field'}
            disabled={pauseDisabled}
            onClick={() => {
              if (pauseDisabled) return;
              handleSafety('PAUSE');
            }}
          >
            {directorState.isPaused ? 'Resume Race' : 'Pause Race'}
          </button>
          <button
            type="button"
            className={getButtonClass('danger', directorState.isAborted)}
            title="Abort the session"
            disabled={abortDisabled}
            onClick={() => {
              if (abortDisabled) return;
              handleSafety('ABORT');
            }}
          >
            Abort
          </button>
        </div>
      </div>

      <div className="fia-group">
        <div className="group-title">Admin Controls</div>
        <div className="button-grid">
          {adminControls.map(control => (
            <button
              key={control.action}
              type="button"
              className={getButtonClass(control.active ? 'success' : 'neutral', control.active)}
              title={control.title}
              disabled={adminDisabled && !control.active}
              onClick={() => {
                if (adminDisabled && !control.active) return;
                handleAdmin(control.action);
              }}
            >
              {control.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FIAControlPanel;
