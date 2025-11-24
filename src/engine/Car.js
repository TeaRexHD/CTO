import * as THREE from 'three';

export class Car {
  constructor(id, position, color, aiProfile) {
    this.id = id;
    this.color = color;
    this.aiProfile = aiProfile;

    this.size = { x: 4, y: 1.5, z: 2 };
    this.mass = 800;
    this.maxSpeed = aiProfile.baseSpeed;
    this.acceleration = aiProfile.acceleration;
    this.brakeForce = 1500;
    this.turnSpeed = aiProfile.turnSpeed;

    this.velocity = new THREE.Vector3(0, 0, 0);
    this.mesh = this.createMesh();
    this.mesh.position.copy(position);

    const angle = Math.atan2(position.z, position.x) + Math.PI / 2;
    this.mesh.rotation.y = angle;

    this.controls = {
      throttle: 0,
      brake: 0,
      steering: 0
    };

    this.targetPosition = null;
    this.waypointIndex = 0;
    this.laneOffset = 0;

    this.penaltyState = { type: 'none' };
    this.servingPenalty = false;
    this.timePenalties = 0;
    this.warnings = 0;
    this.disqualified = false;
    this.underInvestigation = false;
    this.blueFlagActive = false;
    this.lastOffTrackIncident = 0;
    this.lapCount = 0;
    this.isLapped = false;
  }

  createMesh() {
    const group = new THREE.Group();

    const bodyGeometry = new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z);
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
      color: this.color,
      shininess: 100
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = this.size.y / 2;
    group.add(body);

    const noseGeometry = new THREE.BoxGeometry(1, this.size.y * 0.8, this.size.z * 0.6);
    const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
    nose.position.set(this.size.x / 2 + 0.5, this.size.y / 2, 0);
    group.add(nose);

    const wingGeometry = new THREE.BoxGeometry(0.3, 0.1, this.size.z * 1.2);
    const wingMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const frontWing = new THREE.Mesh(wingGeometry, wingMaterial);
    frontWing.position.set(this.size.x / 2 + 1, this.size.y * 0.3, 0);
    group.add(frontWing);

    const rearWingGeometry = new THREE.BoxGeometry(0.3, 1, this.size.z * 0.8);
    const rearWing = new THREE.Mesh(rearWingGeometry, wingMaterial);
    rearWing.position.set(-this.size.x / 2 - 0.2, this.size.y * 1.2, 0);
    group.add(rearWing);

    const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x111111 });

    const wheelPositions = [
      { x: 1.2, z: 1.2 },
      { x: 1.2, z: -1.2 },
      { x: -1.2, z: 1.2 },
      { x: -1.2, z: -1.2 }
    ];

    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos.x, this.size.y * 0.4, pos.z);
      group.add(wheel);
    });

    const cockpitGeometry = new THREE.BoxGeometry(1.5, 0.6, 1);
    const cockpitMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x333333,
      transparent: true,
      opacity: 0.7
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.set(-0.3, this.size.y * 1.2, 0);
    group.add(cockpit);

    group.castShadow = true;
    group.receiveShadow = true;

    return group;
  }

  update(waypoints, allCars) {
    this.updateAI(waypoints, allCars);
  }

  updateAI(waypoints, allCars) {
    if (this.disqualified) {
      this.controls = { throttle: 0, brake: 1, steering: 0 };
      return;
    }

    if (this.servingPenalty && this.penaltyState && this.penaltyState.active) {
      this.controls.steering = 0;
      this.controls.throttle = 0.3;
      this.controls.brake = 0;
      return;
    }

    const currentWaypoint = waypoints[this.waypointIndex];
    const nextWaypointIndex = (this.waypointIndex + 1) % waypoints.length;

    const distanceToWaypoint = this.mesh.position.distanceTo(currentWaypoint);
    if (distanceToWaypoint < 15) {
      this.waypointIndex = nextWaypointIndex;
      if (this.waypointIndex === 0) {
        this.lapCount++;
      }
    }

    const targetPos = currentWaypoint.clone();
    targetPos.x += this.laneOffset * Math.cos(Math.atan2(targetPos.z, targetPos.x) + Math.PI / 2);
    targetPos.z += this.laneOffset * Math.sin(Math.atan2(targetPos.z, targetPos.x) + Math.PI / 2);

    const directionToTarget = new THREE.Vector3()
      .subVectors(targetPos, this.mesh.position)
      .normalize();

    const forward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.mesh.quaternion)
      .normalize();

    const cross = new THREE.Vector3().crossVectors(forward, directionToTarget);
    const dot = forward.dot(directionToTarget);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    const steeringDirection = cross.y > 0 ? 1 : -1;

    const obstacleAhead = this.detectObstacle(allCars);

    if (this.blueFlagActive) {
      this.controls.steering = steeringDirection * Math.min(angle * 2, 1);
      this.controls.throttle = 0.5;
      this.controls.brake = 0;
      this.laneOffset += 2;
      this.laneOffset = Math.max(-5, Math.min(5, this.laneOffset));
      return;
    }

    if (obstacleAhead) {
      this.controls.steering = steeringDirection * Math.min(angle * 3, 1);
      this.controls.throttle = 0.4;
      this.controls.brake = 0.3;

      if (this.aiProfile.aggression > 0.6) {
        this.laneOffset += (Math.random() - 0.5) * 0.5;
        this.laneOffset = Math.max(-5, Math.min(5, this.laneOffset));
      }
    } else {
      this.controls.steering = steeringDirection * Math.min(angle * 2, 1);

      const speed = this.velocity.length();
      const targetSpeed = this.maxSpeed;

      if (angle > 0.5) {
        this.controls.throttle = 0.5;
        this.controls.brake = 0.2;
      } else if (speed < targetSpeed * 0.8) {
        this.controls.throttle = this.aiProfile.aggression;
        this.controls.brake = 0;
      } else {
        this.controls.throttle = 0.7;
        this.controls.brake = 0;
      }

      this.laneOffset *= 0.99;
    }
  }

  detectObstacle(allCars) {
    const lookAheadDistance = 15 + this.velocity.length() * 0.5;

    for (const otherCar of allCars) {
      if (otherCar.id === this.id) continue;

      const distanceToOther = this.mesh.position.distanceTo(otherCar.mesh.position);
      if (distanceToOther < lookAheadDistance) {
        const directionToOther = new THREE.Vector3()
          .subVectors(otherCar.mesh.position, this.mesh.position)
          .normalize();

        const forwardDir = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(this.mesh.quaternion)
          .normalize();

        const dot = forwardDir.dot(directionToOther);

        if (dot > 0.7 && distanceToOther < 12) {
          return true;
        }
      }
    }

    return false;
  }

  getSpeed() {
    return this.velocity.length();
  }

  getPosition() {
    return this.mesh.position.clone();
  }
}
