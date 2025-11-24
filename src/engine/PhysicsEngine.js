import * as THREE from 'three';

export class PhysicsEngine {
  constructor() {
    this.gravity = -9.81;
    this.airDensity = 1.225;
  }

  applyPhysics(car, deltaTime) {
    const dt = Math.min(deltaTime, 0.033);

    const throttle = car.controls.throttle;
    const brake = car.controls.brake;
    const steering = car.controls.steering;

    const dragCoefficient = 0.3;
    const rollingResistance = 30;
    const maxSpeed = car.maxSpeed;
    const acceleration = car.acceleration;
    const turnSpeed = car.turnSpeed;

    let force = 0;
    if (throttle > 0) {
      force = acceleration * throttle;
    }
    if (brake > 0) {
      force -= car.brakeForce * brake;
    }

    const speed = car.velocity.length();
    const dragForce = dragCoefficient * speed * speed + rollingResistance;
    force -= dragForce;

    const speedLimitFactor = Math.max(0, 1 - speed / (maxSpeed * 1.2));
    force *= speedLimitFactor;

    const accelerationValue = force / car.mass;
    const newSpeed = Math.max(0, speed + accelerationValue * dt);
    const clampedSpeed = Math.min(newSpeed, maxSpeed);

    if (clampedSpeed > 0) {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(car.mesh.quaternion);
      car.velocity.copy(forward.multiplyScalar(clampedSpeed));
    } else {
      car.velocity.set(0, 0, 0);
    }

    if (steering !== 0 && speed > 1) {
      const turnRate = steering * turnSpeed * dt;
      const speedFactor = Math.min(speed / 50, 1);
      car.mesh.rotation.y += turnRate * speedFactor;
    }

    car.mesh.position.add(car.velocity.clone().multiplyScalar(dt));

    const tilt = steering * 0.15;
    const targetRoll = -tilt;
    car.mesh.rotation.z += (targetRoll - car.mesh.rotation.z) * 5 * dt;
  }

  checkCarCollision(car1, car2) {
    const distance = car1.mesh.position.distanceTo(car2.mesh.position);
    const minDistance = (car1.size.x + car2.size.x) / 2;

    if (distance < minDistance) {
      const overlap = minDistance - distance;
      const direction = new THREE.Vector3()
        .subVectors(car1.mesh.position, car2.mesh.position)
        .normalize();

      car1.mesh.position.add(direction.multiplyScalar(overlap * 0.5));
      car2.mesh.position.sub(direction.multiplyScalar(overlap * 0.5));

      const relativeVelocity = new THREE.Vector3()
        .subVectors(car1.velocity, car2.velocity);
      const velocityAlongCollision = relativeVelocity.dot(direction);

      if (velocityAlongCollision < 0) {
        const restitution = 0.3;
        const impulse = -(1 + restitution) * velocityAlongCollision / 2;

        car1.velocity.add(direction.clone().multiplyScalar(impulse));
        car2.velocity.sub(direction.clone().multiplyScalar(impulse));

        const speedReduction = 0.7;
        car1.velocity.multiplyScalar(speedReduction);
        car2.velocity.multiplyScalar(speedReduction);
      }

      return true;
    }

    return false;
  }

  checkTrackBoundary(car, track) {
    const pos = car.mesh.position;
    const distanceFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);

    const outerRadius = track.innerRadius + track.trackWidth;
    const innerRadius = track.innerRadius;

    if (distanceFromCenter > outerRadius) {
      const angle = Math.atan2(pos.z, pos.x);
      pos.x = Math.cos(angle) * outerRadius;
      pos.z = Math.sin(angle) * outerRadius;

      car.velocity.multiplyScalar(0.5);

      return true;
    }

    if (distanceFromCenter < innerRadius) {
      const angle = Math.atan2(pos.z, pos.x);
      pos.x = Math.cos(angle) * innerRadius;
      pos.z = Math.sin(angle) * innerRadius;

      car.velocity.multiplyScalar(0.5);

      return true;
    }

    return false;
  }
}
