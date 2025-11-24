# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Application                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              RaceSimulator Component                    │ │
│  │                                                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │ │
│  │  │   Three.js   │  │    Scene     │  │   Camera    │ │ │
│  │  │   Renderer   │  │   Manager    │  │ Controller  │ │ │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │ │
│  │                                                         │ │
│  │  ┌────────────────────────────────────────────────────┐ │
│  │  │              Game Loop (60 FPS)                    │ │
│  │  │  1. Update AI    → 2. Apply Physics               │ │
│  │  │  3. Check Collisions → 4. Update Camera → Render  │ │
│  │  └────────────────────────────────────────────────────┘ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Simulation Engine                         │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐  ┌──────────┐ │
│  │  Track   │   │   Car    │   │ Physics  │  │    AI    │ │
│  │  System  │   │  Models  │   │  Engine  │  │ Profiles │ │
│  │          │   │  (×20)   │   │          │  │          │ │
│  │ - Mesh   │   │ - Mesh   │   │ - Forces │  │ - Aggr.  │ │
│  │ - Bounds │   │ - AI     │   │ - Drag   │  │ - Speed  │ │
│  │ - Waypts │   │ - Ctrl   │   │ - Collis │  │ - Turn   │ │
│  └──────────┘   └──────────┘   └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

```
User Input (Keyboard)
    ↓
Camera Controller
    ↓                    ┌─── AI Decision Making
    ↓                    ↓
Camera Update    →    Car Controls (Throttle/Brake/Steering)
                       ↓
                   Physics Engine
                   ├─ Apply Forces
                   ├─ Update Velocity
                   └─ Update Position
                       ↓
                   Collision Detection
                   ├─ Car vs Car
                   └─ Car vs Track
                       ↓
                   Update 3D Scene
                       ↓
                   Render Frame
```

## Component Relationships

```
┌─────────────────────┐
│   RaceSimulator     │
│     (React)         │
└──────────┬──────────┘
           │ creates & manages
           ↓
    ┌──────┴──────┬──────────┬───────────┐
    ↓             ↓          ↓           ↓
┌────────┐  ┌──────────┐  ┌─────┐  ┌─────────┐
│ Track  │  │ Physics  │  │ Car │  │ Camera  │
│        │  │  Engine  │  │ (×20)│  │ Control │
└────┬───┘  └─────┬────┘  └──┬──┘  └────┬────┘
     │            │           │          │
     │            │           │          │
     │ provides   │ updates   │ provides │
     │ waypoints  │ position  │ position │
     │            │           │          │
     └────────────┴───────────┴──────────┘
              uses / updates
```

## AI Decision Tree

```
Start Update
    ↓
Calculate direction to waypoint
    ↓
Check for obstacles ahead ──Yes→ Evasive Action
    ↓ No                         ├─ Reduce throttle
    ↓                            ├─ Apply brakes
Normal Racing                    ├─ Steer away
    ↓                            └─ Change lane (if aggressive)
Check corner angle
    ↓
Sharp turn? ──Yes→ Reduce speed
    ↓ No
    ↓
Below target speed? ──Yes→ Full throttle
    ↓ No
    ↓
Maintain speed
    ↓
Apply steering correction
    ↓
End Update
```

## Physics Pipeline

```
Frame Start (t)
    ↓
For each car:
    ↓
    Read Controls
    ├─ Throttle [0-1]
    ├─ Brake [0-1]
    └─ Steering [-1 to 1]
    ↓
    Calculate Net Force
    ├─ Engine force = throttle × acceleration
    ├─ Brake force = brake × brakeForce
    ├─ Drag = 0.3 × speed²
    └─ Total = Engine - Brake - Drag
    ↓
    Apply Newton's Laws
    ├─ acceleration = force / mass
    ├─ velocity += acceleration × dt
    └─ position += velocity × dt
    ↓
    Update rotation
    └─ rotation.y += steering × turnSpeed × dt
    ↓
Next car
    ↓
Check all collisions (n²)
    ├─ Detect overlap
    ├─ Calculate impulse
    ├─ Separate objects
    └─ Apply velocity change
    ↓
Check track boundaries
    ├─ Detect out of bounds
    ├─ Push back to track
    └─ Apply penalty
    ↓
Frame End (t + dt)
```

## Class Hierarchy

```
PhysicsEngine
├─ applyPhysics(car, dt)
├─ checkCarCollision(car1, car2)
└─ checkTrackBoundary(car, track)

Car
├─ Properties
│  ├─ mesh (Three.Group)
│  ├─ velocity (Vector3)
│  ├─ controls {throttle, brake, steering}
│  └─ aiProfile {speed, aggression, etc}
├─ createMesh()
├─ update(waypoints, allCars)
├─ updateAI(waypoints, allCars)
├─ detectObstacle(allCars)
└─ getSpeed() / getPosition()

Track
├─ Properties
│  ├─ mesh (Three.Group)
│  ├─ waypoints (Vector3[])
│  ├─ innerRadius
│  └─ trackWidth
├─ createTrack()
├─ generateWaypoints()
├─ getStartingPosition(index)
└─ calculateStartingGrid(totalCars)

CameraController
├─ Properties
│  ├─ camera (Three.Camera)
│  ├─ mode ('topdown' | 'chase')
│  └─ targetCar (Car)
├─ setMode(mode)
├─ setTargetCar(car)
├─ update(cars, dt)
├─ updateTopDown(cars)
└─ updateChase(dt)
```

## Module Dependencies

```
main.jsx
  └─→ App.jsx
       └─→ RaceSimulator.jsx
            ├─→ three (THREE)
            ├─→ Track.js
            │    └─→ three
            ├─→ Car.js
            │    ├─→ three
            │    └─→ AIProfiles.js
            ├─→ PhysicsEngine.js
            │    └─→ three
            └─→ CameraController.js
                 └─→ three
```

## Performance Profile

```
Frame Budget: 16.67ms (60 FPS)

Breakdown:
├─ AI Updates (20 cars)          ~2ms   (12%)
│  ├─ Waypoint calculations
│  ├─ Obstacle detection
│  └─ Control updates
│
├─ Physics (20 cars)             ~3ms   (18%)
│  ├─ Force calculations
│  ├─ Velocity updates
│  └─ Position updates
│
├─ Collision Detection (190 checks) ~2ms (12%)
│  ├─ Distance checks
│  ├─ Collision response
│  └─ Track boundaries
│
├─ Rendering                     ~8ms   (48%)
│  ├─ Scene traversal
│  ├─ Draw calls (~140)
│  ├─ Shadow mapping
│  └─ Post-processing
│
└─ Overhead                      ~1.67ms (10%)
   ├─ React updates
   ├─ Event handling
   └─ Stats calculation

Total: ~16.67ms per frame
```

## Memory Layout

```
Heap Memory (~50MB):
├─ Three.js Scene Graph     ~20MB
│  ├─ Geometries (shared)
│  ├─ Materials (shared)
│  └─ Meshes (140 objects)
│
├─ Physics State            ~5MB
│  ├─ Car velocities
│  ├─ Positions
│  └─ Control states
│
├─ Textures & Shaders       ~10MB
│
├─ Three.js Library         ~15MB
│
└─ React & App State        ~5MB
```

## Scalability Considerations

### Current Limits
- **Cars**: 20 (O(n²) collision = 190 checks)
- **Track**: Single circular layout
- **AI**: Simple waypoint following

### Scaling to 50 Cars
```
Changes needed:
├─ Spatial partitioning (quadtree)
│  └─ Reduces collisions to O(n log n)
│
├─ LOD system for distant cars
│  └─ Reduces draw calls by 50%
│
├─ Frustum culling optimization
│  └─ Don't update AI for off-screen cars
│
└─ Web Workers for physics
   └─ Move physics to separate thread
```

### Scaling to Multiple Tracks
```
Track abstraction:
├─ TrackLoader class
├─ JSON track definitions
├─ Spline-based track generation
└─ Track-specific waypoints
```

## Extension Architecture

### Adding Lap Counting
```
1. Add to Car class:
   - lapCount property
   - lastSectorTime[]
   
2. Add to Track class:
   - getSector(position)
   - isStartLineRrossing()
   
3. Add LapTimer component:
   - Track current lap
   - Display sector times
   - Show leaderboard
```

### Adding Pit Stops
```
1. Add to Track:
   - pitLane waypoints
   - pit entry/exit zones
   
2. Add to Car:
   - inPit boolean
   - pitStopTimer
   - tireDegradation
   
3. Add PitStrategy AI:
   - Calculate optimal pit window
   - Navigate pit lane
   - Resume racing
```

### Adding Weather
```
1. Add WeatherSystem class:
   - rainIntensity [0-1]
   - trackWetness [0-1]
   
2. Modify PhysicsEngine:
   - dragCoefficient *= (1 + wetness)
   - maxSpeed *= (1 - wetness*0.3)
   
3. Modify AI:
   - Reduce aggression in rain
   - Adjust braking distances
   
4. Visual effects:
   - Rain particle system
   - Wet track shader
   - Reduced visibility
```

## Testing Strategy

### Unit Tests (Recommended)
```
PhysicsEngine:
├─ Test force calculations
├─ Test collision detection
└─ Test boundary checks

Car:
├─ Test AI waypoint following
├─ Test obstacle detection
└─ Test speed calculations

Track:
├─ Test starting grid layout
├─ Test waypoint generation
└─ Test boundary calculations
```

### Integration Tests
```
Simulation:
├─ 20 cars complete lap
├─ No cars stuck or off-track
├─ Collisions handled correctly
└─ FPS maintains 60
```

### Visual Tests
```
Manual verification:
├─ Cars look correct
├─ Track is properly textured
├─ Lighting is realistic
├─ Camera transitions smooth
└─ UI updates correctly
```
