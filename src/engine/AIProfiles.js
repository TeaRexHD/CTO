export const AI_PROFILES = {
  CONSERVATIVE: {
    name: 'Conservative',
    baseSpeed: 70,
    acceleration: 800,
    turnSpeed: 1.2,
    aggression: 0.5,
    brakingDistance: 1.5
  },
  NORMAL: {
    name: 'Normal',
    baseSpeed: 85,
    acceleration: 1000,
    turnSpeed: 1.5,
    aggression: 0.7,
    brakingDistance: 1.2
  },
  AGGRESSIVE: {
    name: 'Aggressive',
    baseSpeed: 100,
    acceleration: 1200,
    turnSpeed: 1.8,
    aggression: 0.9,
    brakingDistance: 1.0
  }
};

export function getRandomAIProfile() {
  const profiles = Object.values(AI_PROFILES);
  const weights = [0.3, 0.4, 0.3];
  const random = Math.random();
  
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i];
    if (random < sum) {
      const profile = { ...profiles[i] };
      const speedVariation = 0.8 + Math.random() * 0.4;
      profile.baseSpeed *= speedVariation;
      profile.acceleration *= speedVariation;
      return profile;
    }
  }
  
  return { ...profiles[1] };
}

export const CAR_COLORS = [
  0xff0000,
  0x0000ff,
  0x00ff00,
  0xffff00,
  0xff00ff,
  0x00ffff,
  0xff8800,
  0x8800ff,
  0x00ff88,
  0xff0088,
  0x88ff00,
  0x0088ff,
  0xff4444,
  0x4444ff,
  0x44ff44,
  0xffaa00,
  0xaa00ff,
  0x00ffaa,
  0xff00aa,
  0xaaff00
];
