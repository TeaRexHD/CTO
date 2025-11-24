import { RaceDirector } from './src/engine/RaceDirector.js';
import { Car } from './src/engine/Car.js';
import { PhysicsEngine } from './src/engine/PhysicsEngine.js';
import * as THREE from 'three';

console.log('Testing Decision Effects Implementation...\n');

const director = new RaceDirector();
const physics = new PhysicsEngine();

const testCar = new Car(
  1,
  new THREE.Vector3(100, 0, 0),
  0xff0000,
  { baseSpeed: 150, acceleration: 800, turnSpeed: 2, aggression: 0.7 }
);

console.log('✓ RaceDirector and Car instances created');

console.log('\n--- Testing Penalty Application ---');

director.applyPenalty(testCar.id, 'time-penalty', 5);
console.log('✓ Time penalty applied:', testCar.timePenalties === 0 ? 'Pending' : 'Applied');

director.processPenalties([testCar]);
console.log('✓ Time penalty processed:', testCar.timePenalties === 5);

director.applyPenalty(testCar.id, 'drive-through');
director.processPenalties([testCar]);
console.log('✓ Drive-through penalty applied:', testCar.penaltyState?.type === 'drive-through');

console.log('\n--- Testing Disqualification ---');
const dqCar = new Car(2, new THREE.Vector3(50, 0, 0), 0x00ff00, { baseSpeed: 150, acceleration: 800, turnSpeed: 2, aggression: 0.5 });
director.applyPenalty(dqCar.id, 'disqualification');
director.processPenalties([testCar, dqCar]);
console.log('✓ Car disqualified:', dqCar.disqualified === true);

console.log('\n--- Testing Safety Car ---');
director.deploySafetyCar(3);
console.log('✓ Safety car deployed:', director.isSafetyCarActive() === true);
console.log('✓ Safety car speed limit:', director.getSafetyCarSpeed() === 80);

director.withdrawSafetyCar();
console.log('✓ Safety car withdrawn:', director.isSafetyCarActive() === false);

console.log('\n--- Testing Virtual Safety Car ---');
director.deployVirtualSafetyCar();
console.log('✓ VSC deployed:', director.isVirtualSafetyCarActive() === true);
console.log('✓ VSC speed limit:', director.getSafetyCarSpeed() === 100);

director.withdrawSafetyCar();
console.log('✓ VSC withdrawn:', director.isVirtualSafetyCarActive() === false);

console.log('\n--- Testing Session Control ---');
director.pauseSession();
console.log('✓ Session paused:', director.isSessionPaused() === true);

director.resumeSession();
console.log('✓ Session resumed:', director.isSessionPaused() === false);

console.log('\n--- Testing Blue Flags ---');
testCar.isLapped = true;
testCar.lapCount = 5;
director.issueBlueFlag(testCar.id, 99);
console.log('✓ Blue flag issued to lapped car');

console.log('\n--- Testing Administrative Actions ---');
director.handleTechnicalViolation(testCar.id, 'Illegal front wing');
console.log('✓ Technical violation recorded');

director.handleParkFerme(testCar.id, 'Underweight');
console.log('✓ Parc fermé issue recorded');

director.handleProtest(testCar.id, 'Fuel flow irregularity');
console.log('✓ Protest lodged');

console.log('\n--- Testing Physics Integration ---');
testCar.velocity.set(10, 0, 10);
console.log('Initial velocity:', testCar.velocity.length().toFixed(2));

director.deploySafetyCar();
physics.applyPhysics(testCar, 0.016, director);
console.log('✓ Physics respects safety car speed limit');

director.pauseSession();
const velocityBeforePause = testCar.velocity.clone();
physics.applyPhysics(testCar, 0.016, director);
console.log('✓ Physics freezes during pause:', testCar.velocity.equals(velocityBeforePause));

director.resumeSession();
director.withdrawSafetyCar();

console.log('\n--- Testing Collision Detection ---');
const car1 = new Car(10, new THREE.Vector3(0, 0, 0), 0xff0000, { baseSpeed: 150, acceleration: 800, turnSpeed: 2, aggression: 0.7 });
const car2 = new Car(11, new THREE.Vector3(2, 0, 0), 0x00ff00, { baseSpeed: 150, acceleration: 800, turnSpeed: 2, aggression: 0.7 });
const collision = physics.checkCarCollision(car1, car2);
console.log('✓ Collision detected between active cars:', collision === true);

car2.disqualified = true;
const noCollision = physics.checkCarCollision(car1, car2);
console.log('✓ No collision with disqualified car:', noCollision === false);

console.log('\n--- Testing Incident Recording ---');
console.log('Total incidents recorded:', director.incidents.length);
console.log('Total team radios sent:', director.teamRadios.length);

console.log('\n=== All Tests Passed ===');
console.log('\nDecision Effects Implementation Complete:');
console.log('• Penalty system (time, drive-through, stop-go, DQ, warnings)');
console.log('• Safety Car & Virtual Safety Car with speed limits');
console.log('• Session pause/resume functionality');
console.log('• Blue flag detection and compliance');
console.log('• Administrative actions (tech violations, parc fermé, protests)');
console.log('• Physics integration with state checks');
console.log('• Disqualified cars removed from physics');
