import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Track } from '../engine/Track';
import { Car } from '../engine/Car';
import { PhysicsEngine } from '../engine/PhysicsEngine';
import { CameraController } from '../engine/CameraController';
import { getRandomAIProfile, CAR_COLORS } from '../engine/AIProfiles';
import { useRaceDirector } from '../context/RaceDirectorContext';

const RaceSimulator = () => {
  const mountRef = useRef(null);
  const { raceDirector, dispatchers } = useRaceDirector();
  const [stats, setStats] = useState({
    fps: 0,
    carCount: 20,
    cameraMode: 'topdown',
    lap: 0,
    weather: 'clear',
    flag: 'green',
    sessionStatus: 'initializing'
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !raceDirector) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 200, 500);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 250, 100);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -300;
    directionalLight.shadow.camera.right = 300;
    directionalLight.shadow.camera.top = 300;
    directionalLight.shadow.camera.bottom = -300;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x2d5016, 0.5);
    scene.add(hemisphereLight);

    const track = new Track();
    scene.add(track.getMesh());

    const cars = [];
    const numCars = 20;

    for (let i = 0; i < numCars; i++) {
      const startPosition = track.getStartingPosition(i, numCars);
      const color = CAR_COLORS[i % CAR_COLORS.length];
      const aiProfile = getRandomAIProfile();

      const car = new Car(i, startPosition, color, aiProfile);
      cars.push(car);
      scene.add(car.mesh);
      raceDirector.initializeCar(car.id);
    }

    setStats(prev => ({ ...prev, carCount: cars.length }));

    dispatchers?.onBootstrap?.({
      lap: 12,
      weather: 'overcast',
      currentLapTime: 42,
      totalRaceTime: 1800,
      flag: 'green',
      incidents: [
        { type: 'yellow-flag', severity: 'Medium', location: 'Turn 6' },
        { type: 'track-limits', severity: 'Low', carId: 2, location: 'Sector 2' }
      ]
    });

    const metaSnapshot = raceDirector.getRaceMeta();
    const sessionSnapshot = raceDirector.getSessionState();
    setStats(prev => ({
      ...prev,
      lap: metaSnapshot.lapCount,
      weather: metaSnapshot.weather,
      flag: sessionSnapshot.flag,
      sessionStatus: sessionSnapshot.status
    }));

    const physicsEngine = new PhysicsEngine();
    const cameraController = new CameraController(camera);
    cameraController.setTargetCar(cars[0]);

    const unsubscribes = [
      raceDirector.subscribe('flagChange', session => {
        setStats(prev => ({ ...prev, flag: session?.flag || 'green' }));
      }),
      raceDirector.subscribe('session', session => {
        setStats(prev => ({ ...prev, sessionStatus: session?.status || 'running' }));
      }),
      raceDirector.subscribe('raceMeta', meta => {
        setStats(prev => ({
          ...prev,
          lap: meta?.lapCount ?? prev.lap,
          weather: meta?.weather ?? prev.weather
        }));
      })
    ];

    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTime = 0;
    let currentFPS = 60;
    let animationFrameId;

    const animate = () => {
      const currentTime = performance.now();
      const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.033);
      lastTime = currentTime;

      frameCount++;
      fpsTime += deltaTime;
      if (fpsTime >= 1) {
        currentFPS = Math.round(frameCount / fpsTime);
        frameCount = 0;
        fpsTime = 0;

        setStats(prevStats => ({
          ...prevStats,
          fps: currentFPS
        }));
      }

      const waypoints = track.getWaypoints();
      const sessionRunning = raceDirector.isSessionRunning();
      const freezeAllCars = raceDirector.shouldFreezeCars();
      const globalPace = raceDirector.getGlobalPaceModifier();
      const carDirectives = new Map();

      cars.forEach(car => {
        const directives = raceDirector.getCarDirectives(car.id);
        carDirectives.set(car.id, directives);

        const speedLimiter = directives.speedLimiter ?? 1;
        const tyrePerformance = directives.tyrePerformance ?? 1;
        const driveThroughLimiter = directives.driveThroughTimer > 0 ? directives.driveThroughLimiter ?? 0.6 : 1;
        const baseSpeed = car.baseMaxSpeed || car.maxSpeed;
        const adjustedSpeed = baseSpeed * globalPace * speedLimiter * tyrePerformance * driveThroughLimiter;
        car.maxSpeed = Math.max(5, adjustedSpeed);

        if (freezeAllCars || directives.frozen) {
          car.controls.throttle = 0;
          car.controls.brake = 1;
          car.velocity.set(0, 0, 0);
        }
      });

      if (sessionRunning && !freezeAllCars) {
        cars.forEach(car => {
          const directives = carDirectives.get(car.id);
          if (directives?.frozen) return;

          car.update(waypoints, cars);

          if (directives?.speedLimiter < 1) {
            car.controls.throttle = Math.min(car.controls.throttle, directives.speedLimiter);
          }

          if (directives?.driveThroughTimer > 0) {
            car.controls.throttle = Math.min(car.controls.throttle, directives.driveThroughLimiter ?? 0.6);
          }

          physicsEngine.applyPhysics(car, deltaTime);
        });

        for (let i = 0; i < cars.length; i++) {
          const directivesA = carDirectives.get(cars[i].id);
          if (directivesA?.frozen) continue;

          for (let j = i + 1; j < cars.length; j++) {
            const directivesB = carDirectives.get(cars[j].id);
            if (directivesB?.frozen) continue;

            const collided = physicsEngine.checkCarCollision(cars[i], cars[j]);
            raceDirector.checkCollisionIncident(cars[i], cars[j], collided);
          }
        }

        cars.forEach(car => {
          physicsEngine.checkTrackBoundary(car, track);
          raceDirector.checkTrackLimitViolation(car, track);
        });

        cars.forEach(car => {
          raceDirector.updateTelemetry(car, deltaTime, cars, waypoints);
        });
      }

      raceDirector.update(deltaTime);
      cameraController.update(cars, deltaTime);
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const handleKeyPress = (e) => {
      if (e.key === '1') {
        cameraController.setMode('topdown');
        setStats(prev => ({ ...prev, cameraMode: 'topdown' }));
      } else if (e.key === '2') {
        cameraController.setMode('chase');
        setStats(prev => ({ ...prev, cameraMode: 'chase' }));
      } else if (e.key === 'c' || e.key === 'C') {
        const currentIndex = cars.findIndex(car => car === cameraController.targetCar);
        const nextIndex = (currentIndex + 1) % cars.length;
        cameraController.setTargetCar(cars[nextIndex]);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyPress);

    return () => {
      unsubscribes.forEach(unsub => unsub && unsub());
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyPress);

      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }

      renderer.dispose();

      cars.forEach(car => {
        if (car.mesh) {
          car.mesh.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
        }
      });

      if (track.mesh) {
        track.mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(material => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
    };
  }, [raceDirector, dispatchers]);

  const handleCameraChange = (mode) => {
    const event = new KeyboardEvent('keydown', { key: mode === 'topdown' ? '1' : '2' });
    window.dispatchEvent(event);
  };

  return (
    <>
      <div className="controls">
        <h3>F1 Race Simulator</h3>
        <div>
          <button 
            onClick={() => handleCameraChange('topdown')}
            className={stats.cameraMode === 'topdown' ? 'active' : ''}
          >
            Top-Down (1)
          </button>
          <button 
            onClick={() => handleCameraChange('chase')}
            className={stats.cameraMode === 'chase' ? 'active' : ''}
          >
            Chase Cam (2)
          </button>
        </div>
        <div className="stats">
          <div>FPS: {stats.fps}</div>
          <div>Cars: {stats.carCount}</div>
          <div>Camera: {stats.cameraMode}</div>
          <div>Lap: {stats.lap}</div>
          <div>Weather: {stats.weather}</div>
          <div>Flag: {stats.flag}</div>
          <div>Status: {stats.sessionStatus}</div>
          <div style={{ marginTop: '10px', fontSize: '11px' }}>
            Press C to cycle through cars in chase mode
          </div>
        </div>
      </div>
      <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />
    </>
  );
};

export default RaceSimulator;
