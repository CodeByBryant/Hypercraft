import { describe, expect, it } from 'vitest';
import { IREG } from '../../src/content/itemRegistry';
import { arrowDamage, attackCooldown, attackDamage, bowPower, FIST_COOLDOWN, hitWear, swingStrength } from '../../src/game/combat';
import { MAX_AIR, MAX_HEALTH, Vitals } from '../../src/game/Vitals';

describe('combat numbers', () => {
  it('scales melee damage with tool kind and tier', () => {
    expect(attackDamage(-1)).toBe(1);
    expect(attackDamage(IREG.id('stick'))).toBe(1);
    expect(attackDamage(IREG.id('wood_sword'))).toBe(4);
    expect(attackDamage(IREG.id('iron_sword'))).toBe(6);
    expect(attackDamage(IREG.id('hyperite_sword'))).toBe(7);
    expect(attackDamage(IREG.id('iron_axe'))).toBeGreaterThan(attackDamage(IREG.id('iron_sword')));
    expect(attackDamage(IREG.id('iron_pickaxe'))).toBeLessThan(attackDamage(IREG.id('iron_sword')));
    expect(attackCooldown(-1)).toBe(FIST_COOLDOWN);
    expect(attackCooldown(IREG.id('iron_axe'))).toBeGreaterThan(attackCooldown(IREG.id('iron_sword')));
  });

  it('weakens spammed swings and recovers to full strength', () => {
    expect(swingStrength(0, 0.6)).toBeCloseTo(0.2);
    expect(swingStrength(0.3, 0.6)).toBeCloseTo(0.4);
    expect(swingStrength(0.6, 0.6)).toBe(1);
    expect(swingStrength(5, 0.6)).toBe(1);
  });

  it('wears swords by one and other tools by two per hit', () => {
    expect(hitWear(IREG.id('stone_sword'))).toBe(1);
    expect(hitWear(IREG.id('stone_pickaxe'))).toBe(2);
    expect(hitWear(-1)).toBe(0);
    expect(hitWear(IREG.id('dirt'))).toBe(0);
  });

  it('charges a bow over one second', () => {
    expect(bowPower(0)).toBe(0);
    expect(bowPower(0.5)).toBeCloseTo((0.25 + 1) / 3);
    expect(bowPower(1)).toBe(1);
    expect(bowPower(3)).toBe(1);
    expect(arrowDamage(1)).toBe(9);
    expect(arrowDamage(0.1)).toBe(1);
  });
});

describe('vitals', () => {
  it('takes damage with a short invulnerability window and dies at zero', () => {
    const v = new Vitals();
    expect(v.damage(5, 'Test', false)).toBe(5);
    expect(v.health).toBe(MAX_HEALTH - 5);
    expect(v.damage(5, 'Test', false)).toBe(0); // i-frames
    v.update(0.6, false, false);
    expect(v.damage(100, 'Squashed', false)).toBe(100);
    expect(v.dead).toBe(true);
    expect(v.deathCause).toBe('Squashed');
    expect(v.health).toBe(0);
    v.respawn();
    expect(v.dead).toBe(false);
    expect(v.health).toBe(MAX_HEALTH);
  });

  it('ignores damage when invulnerable (creative)', () => {
    const v = new Vitals();
    expect(v.damage(50, 'Test', true)).toBe(0);
    expect(v.health).toBe(MAX_HEALTH);
  });

  it('regenerates after four quiet seconds', () => {
    const v = new Vitals();
    v.damage(6, 'Test', false);
    for (let t = 0; t < 3.9; t += 0.1) v.update(0.1, false, false);
    expect(v.health).toBe(MAX_HEALTH - 6);
    for (let t = 0; t < 4.2; t += 0.1) v.update(0.1, false, false);
    expect(v.health).toBeGreaterThanOrEqual(MAX_HEALTH - 5);
  });

  it('drowns after the air runs out, and refills air above water', () => {
    const v = new Vitals();
    let drown = 0;
    for (let t = 0; t < MAX_AIR - 0.05; t += 0.1) drown += v.update(0.1, true, false);
    expect(drown).toBe(0);
    for (let t = 0; t < 1.2; t += 0.1) drown += v.update(0.1, true, false);
    expect(drown).toBe(2);
    for (let t = 0; t < 4; t += 0.1) v.update(0.1, false, false);
    expect(v.air).toBe(MAX_AIR);
  });

  it('computes fall damage like Minecraft (1 per block beyond 3)', () => {
    expect(Vitals.fallDamage(2.9)).toBe(0);
    expect(Vitals.fallDamage(3.5)).toBe(0);
    expect(Vitals.fallDamage(4)).toBe(1);
    expect(Vitals.fallDamage(10.2)).toBe(7);
    expect(Vitals.fallDamage(23)).toBe(20);
  });

  it('saves and restores within bounds', () => {
    const v = new Vitals();
    v.load({ health: 7.5, air: 3 });
    expect(v.health).toBe(7.5);
    expect(v.air).toBe(3);
    v.load({ health: 0, air: 99 });
    expect(v.health).toBe(1); // never load a dead player
    expect(v.air).toBe(MAX_AIR);
    expect(v.save()).toEqual({ health: 1, air: MAX_AIR });
  });
});
