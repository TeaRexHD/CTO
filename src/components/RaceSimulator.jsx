import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Track } from '../engine/Track';
import { Car } from '../engine/Car';
import { PhysicsEngine } from '../engine/PhysicsEngine';
import { CameraController } from '../engine/CameraController';
import { getRandomAIProfile, CAR_COLORS } from '../engine/AIProfiles';
import { RaceDirector } from '../engine/RaceDirector';

const RaceSimulator = () => {
  const mountRef = useRef(null);
  const raceDirectorRef = useRef(null);
  const [stats, setStats] = useState({
    fps: 0,
    carCount: 20,
    cameraMode: 'topdown',
    safetyCarActive: false,
    vscActive: false,
    sessionPaused: false
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

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
    }

    const physicsEngine = new PhysicsEngine();
    const cameraController = new CameraController(camera);
    cameraController.setTargetCar(cars[0]);

    if (!raceDirectorRef.current) {
      raceDirectorRef.current = new RaceDirector();
    }
    const raceDirector = raceDirectorRef.current;

    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTime = 0;
    let currentFPS = 60;
    let updateCounter = 0;

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
          fps: currentFPS,
          safetyCarActive: raceDirector.isSafetyCarActive(),
          vscActive: raceDirector.isVirtualSafetyCarActive(),
          sessionPaused: raceDirector.isSessionPaused()
        }));
      }

      raceDirector.update();

      updateCounter++;
      if (updateCounter % 60 === 0) {
        raceDirector.processPenalties(cars);
      }

      const waypoints = track.getWaypoints();

      cars.forEach(car => {
        raceDirector.updateCarPenalties(car);
        car.update(waypoints, cars);
        physicsEngine.applyPhysics(car, deltaTime, raceDirector);
      });

      cars.forEach(car => {
        if (!car.disqualified && !car.isLapped) {
          const lapLeader = cars.reduce((leader, c) => 
            c.lapCount > leader.lapCount ? c : leader
          , cars[0]);
          
          if (lapLeader.lapCount > car.lapCount + 1) {
            car.isLapped = true;
          }
        }
      });

      cars.forEach(car => {
        if (car.blueFlagActive) {
          car.blueFlagActive = false;
        }
      });

      cars.forEach((car, index) => {
        if (car.isLapped) {
          for (let i = 0; i < cars.length; i++) {
            if (i !== index && !cars[i].isLapped && !cars[i].disqualified) {
              const distance = car.mesh.position.distanceTo(cars[i].mesh.position);
              if (distance < 30) {
                car.blueFlagActive = true;
                if (Math.random() < 0.01) {
                  raceDirector.issueBlueFlag(car.id, cars[i].id);
                }
                break;
              }
            }
          }
        }
      });

      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const collisionOccurred = physicsEngine.checkCarCollision(cars[i], cars[j]);
          raceDirector.checkCollision(cars[i], cars[j], collisionOccurred);
        }
      }

      cars.forEach(car => {
        const offTrack = physicsEngine.checkTrackBoundary(car, track);
        raceDirector.checkTrackBoundary(car, offTrack);
      });

      cameraController.update(cars, deltaTime);

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate();

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
      } else if (e.key === 's' || e.key === 'S') {
        if (raceDirector.isSafetyCarActive()) {
          raceDirector.withdrawSafetyCar();
        } else {
          raceDirector.deploySafetyCar(3);
        }
      } else if (e.key === 'v' || e.key === 'V') {
        if (raceDirector.isVirtualSafetyCarActive()) {
          raceDirector.withdrawSafetyCar();
        } else {
          raceDirector.deployVirtualSafetyCar();
        }
      } else if (e.key === 'p' || e.key === 'P') {
        if (raceDirector.isSessionPaused()) {
          raceDirector.resumeSession();
        } else {
          raceDirector.pauseSession();
        }
      } else if (e.key === 'd' || e.key === 'D') {
        const randomCar = cars[Math.floor(Math.random() * cars.length)];
        raceDirector.applyPenalty(randomCar.id, 'drive-through');
      } else if (e.key === 't' || e.key === 'T') {
        const randomCar = cars[Math.floor(Math.random() * cars.length)];
        raceDirector.applyPenalty(randomCar.id, 'time-penalty', 5);
      } else if (e.key === 'q' || e.key === 'Q') {
        const randomCar = cars[Math.floor(Math.random() * cars.length)];
        raceDirector.applyPenalty(randomCar.id, 'disqualification');
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyPress);

    return () => {
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
  }, []);

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
          {stats.safetyCarActive && (
            <div style={{ color: '#ff0', fontWeight: 'bold' }}>🚨 SAFETY CAR</div>
          )}
          {stats.vscActive && (
            <div style={{ color: '#ff0', fontWeight: 'bold' }}>⚠️ VSC</div>
          )}
          {stats.sessionPaused && (
            <div style={{ color: '#f00', fontWeight: 'bold' }}>⏸ PAUSED</div>
          )}
          <div style={{ marginTop: '10px', fontSize: '11px' }}>
            Press C to cycle cars | S: Safety Car<br/>
            V: VSC | P: Pause | D: Drive-through<br/>
            T: Time penalty | Q: Disqualify
          </div>
        </div>
      </div>
      <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />
    </>
  );
};

export default RaceSimulator;
