# Decision Effects Implementation - Interactive Demo

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Open Browser**
   - Navigate to `http://localhost:5173`
   - The race will start automatically with 20 AI cars

## Demo Scenarios

### Scenario 1: Safety Car Management (30 seconds)

**Objective**: Demonstrate race control during incidents

1. Let the race run for 5 seconds
2. Press **S** to deploy Safety Car
   - Observe: All cars slow to ~80 speed
   - Observe: Yellow "🚨 SAFETY CAR" indicator appears
   - Check console: Team radio messages sent
3. Wait 10 seconds (watch cars bunch up)
4. Press **S** again to withdraw
   - Observe: Cars resume normal racing speed
   - Observe: Indicator disappears

**Expected Result**: ✅ Field bunches up under SC, spreads out after withdrawal

### Scenario 2: Virtual Safety Car (20 seconds)

**Objective**: Show VSC speed control

1. Press **V** to deploy VSC
   - Observe: All cars slow to ~100 speed
   - Observe: Yellow "⚠️ VSC" indicator appears
2. Wait 10 seconds
3. Press **V** to end VSC
   - Observe: Racing resumes at normal speed

**Expected Result**: ✅ VSC is less restrictive than SC, allows more spacing

### Scenario 3: Drive-Through Penalty (45 seconds)

**Objective**: Demonstrate penalty enforcement

1. Switch to chase camera (press **2**)
2. Cycle through cars (press **C**) to find an active racer
3. Press **D** to apply drive-through to random car
   - Check console: Penalty notification
   - Check console: Team radio "Box this lap for drive-through"
4. Find the penalized car (if you know the ID)
5. Watch it slow down to pit lane speed (~60)
6. After ~15 seconds, car resumes normal speed

**Expected Result**: ✅ Car visibly slows, then returns to racing speed

### Scenario 4: Disqualification (Immediate)

**Objective**: Show immediate car removal from race

1. Switch to top-down camera (press **1**)
2. Note car positions
3. Press **Q** to disqualify random car
   - Check console: "Disqualified from race" message
4. Observe: One car stops moving immediately
5. Watch other cars pass through/around it
6. Press **C** multiple times to cycle - DQ car won't respond

**Expected Result**: ✅ Car stops, no longer participates in racing or collisions

### Scenario 5: Session Pause (15 seconds)

**Objective**: Demonstrate session control

1. Let race run normally
2. Press **P** to pause
   - Observe: Red "⏸ PAUSED" indicator appears
   - Observe: All cars freeze in position
   - Observe: FPS counter continues updating (UI responsive)
3. Try pressing **C** - camera cycles still work
4. Press **P** to resume
   - Observe: Cars continue from exact frozen positions

**Expected Result**: ✅ Physics frozen, UI responsive, smooth resume

### Scenario 6: Time Penalty (Quick test)

**Objective**: Show classification penalty

1. Press **T** to apply 5-second time penalty
   - Check console: "5 second time penalty" message
   - Check console: Team radio notification
2. Open browser console
3. Type: `window.cars` (if exposed) or check RaceDirector
4. Find car with `timePenalties = 5`

**Expected Result**: ✅ Penalty recorded, car continues racing (applied to final time)

### Scenario 7: Blue Flags for Lapped Cars (2+ minutes)

**Objective**: Show automatic lap tracking and blue flag compliance

1. Let race run for 2-3 minutes
2. Some cars will complete more laps than others
3. Watch for blue flag incidents in console
4. Observe lapped cars moving aside when leaders approach

**Expected Result**: ✅ Lapped cars automatically detected and shown blue flags

### Scenario 8: Multiple Penalties (Chaos mode!)

**Objective**: Stress test the system

1. Rapidly press:
   - **D** (drive-through)
   - **T** (time penalty)  
   - **Q** (disqualification)
   - **S** (safety car)
2. Observe multiple penalties being processed
3. Check console for incident log
4. Verify no crashes or freezes

**Expected Result**: ✅ System handles multiple simultaneous penalties gracefully

### Scenario 9: Combined Safety Car + Penalties

**Objective**: Show systems working together

1. Deploy Safety Car (press **S**)
2. While SC is active, apply penalties:
   - Press **D** for drive-through
   - Press **T** for time penalty
3. Withdraw Safety Car (press **S**)
4. Watch penalized car slow down even more
5. Observe: Pit lane speed limit < SC speed limit

**Expected Result**: ✅ Speed limits stack correctly, penalties enforced during SC

## Keyboard Reference Card

```
═══════════════════════════════════════════════════
  F1 RACE DIRECTOR - KEYBOARD CONTROLS
═══════════════════════════════════════════════════

CAMERA
  1  ─  Top-Down View
  2  ─  Chase Camera
  C  ─  Cycle Target Car (in chase mode)

RACE CONTROL
  S  ─  Toggle Safety Car (yellow 🚨)
  V  ─  Toggle Virtual Safety Car (yellow ⚠️)
  P  ─  Toggle Pause/Resume (red ⏸)

PENALTIES
  D  ─  Drive-Through Penalty (random car)
  T  ─  Time Penalty +5s (random car)
  Q  ─  Disqualification (random car)

═══════════════════════════════════════════════════
```

## Console Commands (Advanced)

Open browser console (F12) and try:

```javascript
// Check race state
raceDirector.raceState

// Check incident log
raceDirector.incidents

// Check team radios
raceDirector.teamRadios

// Apply specific penalty to car #5
raceDirector.applyPenalty(5, 'drive-through')
raceDirector.applyPenalty(5, 'time-penalty', 10)
raceDirector.applyPenalty(5, 'stop-go', 5)
raceDirector.applyPenalty(5, 'disqualification')

// Technical violations
raceDirector.handleTechnicalViolation(3, 'Illegal front wing')
raceDirector.handleParkFerme(7, 'Underweight car')
raceDirector.handleProtest(12, 'Fuel flow irregularity')

// Session control
raceDirector.abortSession()  // Red flag

// Check specific car state
cars[0].penaltyState
cars[0].timePenalties
cars[0].disqualified
cars[0].lapCount
```

## Troubleshooting

### Cars not slowing under Safety Car
- Check console for "Safety Car deployed" message
- Verify yellow 🚨 indicator visible
- Ensure physics updates are running (check FPS counter)

### Penalties not applying
- Wait 60 frames (~1 second) for penalty processing
- Check console for penalty messages
- Verify car ID exists (0-19)

### Session won't pause
- Check for red ⏸ indicator
- Verify key press is registering (not in browser text field)
- Try clicking on canvas first to ensure focus

### Blue flags not appearing
- Must wait for lap differences (2+ minutes)
- Only lapped cars receive blue flags
- Check console for "Blue flag shown" messages

## Performance Notes

- All features run at 60 FPS with 20 cars
- Penalty processing throttled to prevent frame drops
- Memory cleanup prevents leaks during long sessions
- Pause/resume has no performance impact

## What to Look For

### Visual Indicators
- ✅ Speed changes visible in car movement
- ✅ UI indicators appear/disappear correctly
- ✅ Disqualified cars become stationary
- ✅ Cars bunch up under Safety Car

### Console Output
- ✅ Incident messages for each penalty
- ✅ Team radio notifications
- ✅ Collision and track limit warnings
- ✅ Blue flag messages for lapped cars

### Technical Verification
- ✅ No console errors or warnings
- ✅ Smooth 60 FPS throughout
- ✅ No memory leaks (check DevTools)
- ✅ State changes immediate and responsive

## Success Criteria

The demo is successful if:
1. All keyboard controls respond instantly
2. Visual indicators match race state
3. Speed limits are visibly enforced
4. Disqualified cars stop completely
5. Session pause/resume works smoothly
6. No crashes or errors occur
7. FPS remains stable throughout

## Developer Notes

### Integration Points
- `RaceDirector` created in `RaceSimulator` useRef
- Physics engine receives race director instance
- All car state changes happen through race director
- Event system ready for UI components to subscribe

### Extensibility
- Add new penalty types in `applyPenalty()`
- Extend administrative actions easily
- Hook into pub-sub for live UI updates
- Safety car laps auto-decrement on waypoint 0

### Testing Automation
Run: `node test-decision-effects.js` for comprehensive unit tests

Enjoy the demo! 🏎️💨
