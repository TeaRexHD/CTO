# Decision Effects Implementation Test Guide

## Overview
This document outlines the testing procedure for the decision effects logic implementation.

## Features Implemented

### 1. Penalty System
- **Time Penalties**: Added to car classification (car.timePenalties)
- **Drive-Through**: Car enters service state, slows to pit lane speed (60)
- **Stop-Go**: Car stops for specified duration in pit lane
- **Disqualification**: Car stops completely and is removed from physics
- **Warnings**: Counter increments on car object

### 2. Blue Flag System
- Automatically detects lapped cars
- Issues blue flags when leading car approaches lapped car
- Lapped car slows down and moves to side when blue flag active
- Team radio notification sent

### 3. Safety Car & Virtual Safety Car
- **Safety Car**: All cars limited to 80 speed units
- **VSC**: All cars limited to 100 speed units
- Bunching effect achieved through speed limiting
- Can be withdrawn to resume normal racing
- Team radio notifications for deployment/withdrawal

### 4. Session Control
- **Pause**: Freezes physics updates, UI remains responsive
- **Resume**: Continues physics updates
- **Abort**: Permanently pauses session

### 5. Administrative Actions
- Technical violations → Investigation + team radio
- Parc fermé issues → Investigation + incident record
- Protests → Investigation + incident tracking

## Manual Testing Instructions

### Keyboard Controls
- **S**: Toggle Safety Car
- **V**: Toggle Virtual Safety Car
- **P**: Toggle Pause/Resume
- **D**: Apply drive-through penalty to random car
- **T**: Apply 5-second time penalty to random car
- **Q**: Disqualify random car
- **C**: Cycle through cars (chase cam)
- **1**: Top-down camera
- **2**: Chase camera

### Test Cases

#### TC1: Time Penalty
1. Press **T** to apply time penalty
2. Verify incident appears in console
3. Check car.timePenalties is incremented
4. Car continues racing normally

#### TC2: Drive-Through Penalty
1. Press **D** to apply drive-through
2. Verify team radio message appears
3. Car should slow down to ~60 speed
4. After ~15 seconds, penalty completes
5. Car resumes normal speed

#### TC3: Disqualification
1. Press **Q** to disqualify random car
2. Car should immediately stop moving
3. Car velocity should be (0,0,0)
4. Car no longer participates in collisions
5. Incident recorded as 'critical'

#### TC4: Safety Car
1. Press **S** to deploy safety car
2. All cars should slow to max 80 speed
3. Yellow "🚨 SAFETY CAR" indicator appears in UI
4. Team radio notifications sent
5. Press **S** again to withdraw
6. Cars resume normal speed

#### TC5: Virtual Safety Car
1. Press **V** to deploy VSC
2. All cars should slow to max 100 speed
3. Yellow "⚠️ VSC" indicator appears in UI
4. Team radio notifications sent
5. Press **V** again to end VSC
6. Cars resume normal speed

#### TC6: Session Pause
1. Press **P** to pause
2. All cars should freeze in position
3. Red "⏸ PAUSED" indicator appears in UI
4. FPS counter should continue updating
5. Press **P** to resume
6. Cars continue racing from frozen positions

#### TC7: Blue Flags
1. Wait for cars to complete multiple laps
2. System automatically detects lapped cars
3. When leading car approaches lapped car:
   - Blue flag incident recorded
   - Team radio sent to lapped car
   - Lapped car slows and moves aside

#### TC8: Collision with Penalties
1. Let cars collide naturally
2. Apply disqualification to one colliding car
3. Verify disqualified car no longer causes collisions
4. Other cars should pass through/ignore disqualified car

## Verification Points

### Physics Engine
- ✅ Respects safety car speed limits
- ✅ Skips physics updates when session paused
- ✅ Ignores disqualified cars in collisions
- ✅ Applies pit lane speed limits during penalties

### Car AI
- ✅ Disqualified cars stop all movement
- ✅ Cars serving penalties reduce speed
- ✅ Blue flag compliance (slow + move aside)
- ✅ Lap counting works correctly

### Race Director
- ✅ Records all incidents with timestamps
- ✅ Generates team radio for critical events
- ✅ Manages penalty queue and application
- ✅ Tracks race state (SC/VSC/paused)
- ✅ Clears old data to prevent memory leaks

### UI Integration
- ✅ State indicators update in real-time
- ✅ Keyboard controls work correctly
- ✅ UI remains responsive during pause
- ✅ Help text displays available controls

## Edge Cases Tested

1. **Multiple penalties on same car**: Queue system prevents conflicts
2. **Pause during safety car**: Both states work together
3. **Disqualify then collide**: Physics skips disqualified cars
4. **Rapid penalty application**: Queue processes one at a time
5. **Safety car during VSC**: One overrides the other

## Performance Considerations

- Penalty processing throttled to every 60 frames
- Collision tracking prevents duplicate incidents (1-second window)
- Old incidents cleared after 30 seconds
- Blue flag checks only for lapped cars
- Session pause stops physics but maintains render loop

## Code Quality

- No unused variables (passes ESLint)
- Proper memory cleanup in useEffect
- Modular design for easy extension
- Self-documenting code (no unnecessary comments)
- Follows existing codebase patterns
