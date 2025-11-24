import * as THREE from 'three';

export class Track {
  constructor() {
    this.innerRadius = 150;
    this.trackWidth = 30;
    this.segments = 64;
    this.mesh = null;
    this.waypoints = [];
    
    this.createTrack();
    this.generateWaypoints();
  }

  createTrack() {
    const group = new THREE.Group();

    const trackShape = new THREE.Shape();
    const outerRadius = this.innerRadius + this.trackWidth;

    for (let i = 0; i <= this.segments; i++) {
      const angle = (i / this.segments) * Math.PI * 2;
      const x = Math.cos(angle) * outerRadius;
      const y = Math.sin(angle) * outerRadius;
      
      if (i === 0) {
        trackShape.moveTo(x, y);
      } else {
        trackShape.lineTo(x, y);
      }
    }

    const holePath = new THREE.Path();
    for (let i = 0; i <= this.segments; i++) {
      const angle = (i / this.segments) * Math.PI * 2;
      const x = Math.cos(angle) * this.innerRadius;
      const y = Math.sin(angle) * this.innerRadius;
      
      if (i === 0) {
        holePath.moveTo(x, y);
      } else {
        holePath.lineTo(x, y);
      }
    }
    trackShape.holes.push(holePath);

    const extrudeSettings = {
      depth: 0.5,
      bevelEnabled: false
    };

    const trackGeometry = new THREE.ExtrudeGeometry(trackShape, extrudeSettings);
    trackGeometry.rotateX(-Math.PI / 2);
    
    const trackMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x2a2a2a,
      side: THREE.DoubleSide
    });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.receiveShadow = true;
    group.add(track);

    const laneMarkingMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const numLanes = 3;
    
    for (let lane = 1; lane < numLanes; lane++) {
      const laneRadius = this.innerRadius + (this.trackWidth / numLanes) * lane;
      const laneGeometry = new THREE.TorusGeometry(laneRadius, 0.1, 8, this.segments);
      laneGeometry.rotateX(Math.PI / 2);
      const laneMesh = new THREE.Mesh(laneGeometry, laneMarkingMaterial);
      laneMesh.position.y = 0.6;
      group.add(laneMesh);
    }

    const startLineGeometry = new THREE.BoxGeometry(this.trackWidth, 0.1, 3);
    const startLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const startLine = new THREE.Mesh(startLineGeometry, startLineMaterial);
    startLine.position.set(this.innerRadius + this.trackWidth / 2, 0.6, 0);
    startLine.rotation.y = Math.PI / 2;
    group.add(startLine);

    const grassInnerGeometry = new THREE.CircleGeometry(this.innerRadius, this.segments);
    grassInnerGeometry.rotateX(-Math.PI / 2);
    const grassMaterial = new THREE.MeshPhongMaterial({ color: 0x2d5016 });
    const grassInner = new THREE.Mesh(grassInnerGeometry, grassMaterial);
    grassInner.position.y = -0.1;
    grassInner.receiveShadow = true;
    group.add(grassInner);

    const grassOuterGeometry = new THREE.RingGeometry(
      outerRadius, 
      outerRadius + 50, 
      this.segments
    );
    grassOuterGeometry.rotateX(-Math.PI / 2);
    const grassOuter = new THREE.Mesh(grassOuterGeometry, grassMaterial);
    grassOuter.position.y = -0.1;
    grassOuter.receiveShadow = true;
    group.add(grassOuter);

    const barrierGeometry = new THREE.TorusGeometry(outerRadius + 2, 0.5, 8, this.segments);
    barrierGeometry.rotateX(Math.PI / 2);
    const barrierMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const outerBarrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
    outerBarrier.position.y = 1;
    group.add(outerBarrier);

    const innerBarrierGeometry = new THREE.TorusGeometry(this.innerRadius - 2, 0.5, 8, this.segments);
    innerBarrierGeometry.rotateX(Math.PI / 2);
    const innerBarrier = new THREE.Mesh(innerBarrierGeometry, barrierMaterial);
    innerBarrier.position.y = 1;
    group.add(innerBarrier);

    this.mesh = group;
  }

  generateWaypoints() {
    const waypointRadius = this.innerRadius + this.trackWidth / 2;
    const numWaypoints = 32;

    for (let i = 0; i < numWaypoints; i++) {
      const angle = (i / numWaypoints) * Math.PI * 2;
      const x = Math.cos(angle) * waypointRadius;
      const z = Math.sin(angle) * waypointRadius;
      this.waypoints.push(new THREE.Vector3(x, 0, z));
    }
  }

  getStartingPosition(index, totalCars) {
    const grid = this.calculateStartingGrid(totalCars);
    return grid[index];
  }

  calculateStartingGrid(totalCars) {
    const positions = [];
    const carsPerRow = 2;
    const columnSpacing = 6;
    const startAngle = 0;
    const startRadius = this.innerRadius + this.trackWidth / 2;

    for (let i = 0; i < totalCars; i++) {
      const row = Math.floor(i / carsPerRow);
      const col = i % carsPerRow;

      const angleOffset = -row * 0.08;
      const angle = startAngle + angleOffset;
      
      const radiusOffset = (col - (carsPerRow - 1) / 2) * columnSpacing;
      const radius = startRadius + radiusOffset;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      positions.push(new THREE.Vector3(x, 0, z));
    }

    return positions;
  }

  getWaypoints() {
    return this.waypoints;
  }

  getMesh() {
    return this.mesh;
  }
}
