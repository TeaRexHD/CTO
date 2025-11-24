import * as THREE from 'three';

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'topdown';
    this.targetCar = null;
    this.smoothPosition = new THREE.Vector3();
    this.smoothLookAt = new THREE.Vector3();
  }

  setMode(mode) {
    this.mode = mode;
  }

  setTargetCar(car) {
    this.targetCar = car;
  }

  update(cars, deltaTime) {
    if (this.mode === 'topdown') {
      this.updateTopDown(cars);
    } else if (this.mode === 'chase' && this.targetCar) {
      this.updateChase(deltaTime);
    }
  }

  updateTopDown(cars) {
    if (cars.length === 0) return;

    let centerX = 0;
    let centerZ = 0;
    let maxDistance = 0;

    cars.forEach(car => {
      centerX += car.mesh.position.x;
      centerZ += car.mesh.position.z;
    });

    centerX /= cars.length;
    centerZ /= cars.length;

    cars.forEach(car => {
      const distance = Math.sqrt(
        Math.pow(car.mesh.position.x - centerX, 2) +
        Math.pow(car.mesh.position.z - centerZ, 2)
      );
      maxDistance = Math.max(maxDistance, distance);
    });

    const height = Math.max(200, maxDistance * 1.8 + 100);
    
    this.camera.position.set(centerX, height, centerZ + height * 0.3);
    this.camera.lookAt(centerX, 0, centerZ);
  }

  updateChase(deltaTime) {
    if (!this.targetCar) return;

    const carPosition = this.targetCar.mesh.position;
    const carRotation = this.targetCar.mesh.rotation;

    const offset = new THREE.Vector3(0, 8, -15);
    offset.applyEuler(new THREE.Euler(0, carRotation.y, 0));

    const targetPosition = new THREE.Vector3()
      .addVectors(carPosition, offset);

    const smoothFactor = 5 * deltaTime;
    this.smoothPosition.lerp(targetPosition, smoothFactor);

    const lookAtOffset = new THREE.Vector3(0, 2, 10);
    lookAtOffset.applyEuler(new THREE.Euler(0, carRotation.y, 0));
    
    const targetLookAt = new THREE.Vector3()
      .addVectors(carPosition, lookAtOffset);

    this.smoothLookAt.lerp(targetLookAt, smoothFactor);

    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLookAt);
  }
}
