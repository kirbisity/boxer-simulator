// Range tables for every gun and bow (physics/ballistics.js): speed, energy and drop with distance, and what each round
// still does through each armour at that distance (physics/ranged.js bulletHit: the armour by the energy at impact, the
// wound by that energy against GUN.woundAt's), the distance at which a plated kit becomes proof against it.
// Usage: node tools/ballistics.js [distances, comma-separated: default 0,7,30,50,80,100,120,150,200,300]

import { atRange, dragRate, muzzleEnergy, projectileSize, rangeTable } from '../src/physics/ballistics.js';
import { arrowProjectile } from '../src/physics/ranged.js';
import { OUTFITS } from '../src/outfits.js';
import { ADAMS, bulletProof, CROSSBOW, GUN, MATCHLOCK, NIAOCHONG, RIFLE, SHOTGUN, THREE_EYED, TURRET_RIFLE, WEAPONS } from '../src/weapons.js';

const distances = (process.argv[2] ?? '0,7,30,50,80,100,120,150,200,300').split(',').map(Number);

const GUNS = {
  'teppō (matchlock)': MATCHLOCK, 'niaochong (Ming)': NIAOCHONG, 'three-eyed gun': THREE_EYED, 'Adams revolver': ADAMS,
  '9 mm pistol': GUN, 'AR-15 (M855)': RIFLE, '00 buck pellet': SHOTGUN, '6.5 Creedmoor': TURRET_RIFLE,
};
const BOWS = { 'long bow war arrow': WEAPONS.longbow, 'composite bow': WEAPONS.bow, crossbow: null };

const row = (label, projectile, energy = muzzleEnergy(projectile)) => {
  const cells = distances.map((d) => {
    const at = atRange(projectile, d);
    return at ? `${Math.round(at.speed)}/${Math.round((energy * at.speed ** 2) / projectile.velocity ** 2)}/${Math.round(at.drop * 100)}` : '-';
  });
  console.log(`${label.padEnd(22)} ${(projectile.kg * 1000).toFixed(1).padStart(5)} g ${(projectileSize(projectile).calibre * 1000).toFixed(1).padStart(4)} mm  ${cells.map((c) => c.padStart(13)).join('')}`);
};

console.log(`speed m/s / energy J / drop cm (a level shot) at ${distances.join(', ')} m`);
console.log(`${''.padEnd(22)} ${'mass'.padStart(7)} ${'bore'.padStart(7)}  ${distances.map((d) => `${d} m`.padStart(13)).join('')}`);
for (const [label, shot] of Object.entries(GUNS)) row(label, shot.projectile, shot.energy);
// An arrow is not shot level at range but lobbed, and its speed over its arc is its cast's again where it comes down to the
// height it left at: its speed and energy here are the drag's alone over that much of its path (e^−kx; Cd constant).
console.log('arrows: speed m/s / energy J over that much of their path (the drag alone)');
for (const [label, weapon] of Object.entries(BOWS)) {
  const projectile = weapon ? arrowProjectile({ spec: weapon }) : arrowProjectile(null, CROSSBOW);
  const k = dragRate(projectile, projectile.velocity);
  const cells = distances.map((d) => `${Math.round(projectile.velocity * Math.exp(-k * d))}/${Math.round(muzzleEnergy(projectile) * Math.exp(-2 * k * d))}`);
  console.log(`${label.padEnd(22)} ${(projectile.kg * 1000).toFixed(1).padStart(5)} g ${(projectileSize(projectile).calibre * 1000).toFixed(1).padStart(4)} mm  ${cells.map((c) => c.padStart(13)).join('')}`);
}

// Where a plated kit becomes proof against each ball (its bulletRating at or above the ball's energy there).
console.log('\nproof from (m): the distance past which the plate holds the ball (- never within the table, 0 at the muzzle)');
for (const [label, shot] of Object.entries(GUNS)) {
  const table = rangeTable(shot.projectile);
  const cells = ['samuraiTosei', 'mingElite', 'knight', 'bannerArmour', 'tournament', 'swat'].map((kind) => {
    const rating = OUTFITS[kind].bulletRating;
    const metre = table.speed.findIndex((speed) => (shot.energy * speed ** 2) / shot.projectile.velocity ** 2 <= rating);
    return `${kind} ${metre < 0 ? '-' : metre}`;
  });
  console.log(`  ${label.padEnd(20)} ${cells.join('   ')}`);
}

// Through armour: the torso's harm of a hit (bulletHit's, an 80 kg man unhurt: 1 drops him), and where the plate is proof.
const KITS = ['mingBrigandine', 'mingIronLamellar', 'ashigaru', 'samuraiTosei', 'mingElite', 'knight', 'tournament', 'police', 'swat'];
console.log('\ntorso harm of one hit (1 drops an 80 kg man; "dent" = proofed plate holds) at the same distances');
for (const [label, shot] of Object.entries({ teppō: MATCHLOCK, 'three-eyed': THREE_EYED, pistol: GUN, 'AR-15': RIFLE })) {
  const projectile = shot.projectile;
  const woundAt = atRange(projectile, GUN.woundAt).speed ** 2;
  console.log(`  ${label}`);
  for (const kind of [null, ...KITS]) {
    const outfit = kind ? OUTFITS[kind] : null;
    const cells = distances.map((d) => {
      const at = atRange(projectile, d);
      if (!at) return '-';
      const energy = (shot.energy * at.speed ** 2) / projectile.velocity ** 2;
      const covered = outfit?.protection.bullet?.torso ?? 0;
      if (outfit?.plated && covered > 0 && (outfit.bulletRating ?? GUN.energy) >= energy) return 'dent';
      // (A pistol round, GUN's own figures: armour's share as it is, bulletHit's shot-less path.)
      const armour = covered * (shot === GUN ? 1 : bulletProof(outfit?.bulletRating, energy));
      return (shot.lethal ?? GUN.lethal).torso * (at.speed ** 2 / woundAt) * (1 - armour);
    }).map((cell) => (typeof cell === 'number' ? cell.toFixed(2) : cell).padStart(7));
    console.log(`    ${(kind ?? 'unarmoured').padEnd(18)} ${cells.join('')}`);
  }
}
