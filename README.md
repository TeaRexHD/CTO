# F1 Race Simulator

A 3D Formula 1 race simulation engine built with React and Three.js, featuring 20 AI-controlled cars with realistic physics and collision detection.

## Features

### 3D Rendering
- Built with Three.js for high-performance 3D graphics
- Simplified F1 track (closed loop, ~2.5 km equivalent)
- 20 AI-controlled F1 car models with detailed meshes
- Optimized for 60 FPS rendering

### Physics Engine
- **Acceleration & Braking**: Realistic force-based acceleration with drag simulation
- **Steering Mechanics**: Speed-dependent turning with visual car tilt
- **Speed Limits & Drag**: Air resistance and rolling resistance calculations
- **Collision Detection**: 
  - Car-to-car collision with impulse-based physics
  - Track boundary detection and correction
  - Collision avoidance in AI logic

### AI Drivers
The simulation includes three distinct AI driver profiles:

1. **Conservative** (30% of drivers)
   - Base speed: 70 km/h equivalent
   - Lower aggression (0.5)
   - Safer driving style

2. **Normal** (40% of drivers)
   - Base speed: 85 km/h equivalent
   - Moderate aggression (0.7)
   - Balanced driving style

3. **Aggressive** (30% of drivers)
   - Base speed: 100 km/h equivalent
   - High aggression (0.9)
   - Risk-taking driving style

Each AI driver features:
- Speed variation (0.8x to 1.2x of base pace)
- Obstacle detection and avoidance
- Lane positioning logic
- Dynamic throttle and brake control
- Waypoint-based navigation

### Camera System
- **Top-Down View**: Overview of entire race with dynamic positioning
- **Chase Camera**: Follow individual cars with smooth camera transitions
- Switchable via keyboard or UI controls
- Press 'C' to cycle through cars in chase mode

### Track Design
- Circular track with inner radius of 150 units
- 30-unit track width with 3 lanes
- Visual lane markings and start/finish line
- Red safety barriers on both sides
- Grass areas inside and outside the track

## Controls

- **1**: Switch to Top-Down camera
- **2**: Switch to Chase camera
- **C**: Cycle through cars (in chase mode)
- **UI Buttons**: Click to change camera modes

## Technical Stack

- **React 18.2**: Component structure and state management
- **Three.js 0.160**: 3D rendering engine
- **Vite 5**: Fast build tool and dev server
- **Custom Physics Engine**: Simplified JavaScript physics (no external physics library)

## Project Structure

```
src/
├── engine/
│   ├── PhysicsEngine.js      # Physics calculations and collision detection
│   ├── Car.js                 # Car class with mesh creation and AI logic
│   ├── Track.js               # Track generation and waypoint system
│   ├── CameraController.js    # Camera positioning and switching
│   └── AIProfiles.js          # AI driver configurations
├── components/
│   └── RaceSimulator.jsx      # Main simulation component
├── App.jsx                    # Application entry point
├── App.css                    # Application styles
├── main.jsx                   # React root
└── index.css                  # Global styles
```

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

The application will start at `http://localhost:3000`

## Build

```bash
npm run build
```

## Performance

- Target: 60 FPS
- 20 simultaneous cars with physics calculations
- Collision detection: O(n²) checks per frame (190 checks for 20 cars)
- Shadow mapping enabled for realistic visuals
- Optimized with delta time for consistent physics

## Modular Architecture

The codebase is designed for easy extension:

- **PhysicsEngine**: Add new physics features (tire friction, weather effects)
- **Car**: Extend with damage models, fuel consumption
- **Track**: Create custom track layouts and shapes
- **AIProfiles**: Add new driving behaviors and strategies
- Ready for flag system integration (yellow flags, safety car)
- Ready for penalty system integration (track limits, collisions)

## Future Enhancements

The architecture supports easy integration of:
- Lap counting and timing
- Flag system (yellow, red, checkered)
- Penalty system for rule violations
- Pit stops and tire wear
- Weather conditions
- Multiplayer support
- Custom track editor
