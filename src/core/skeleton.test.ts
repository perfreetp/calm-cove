import { describe, expect, it } from 'vitest';
import {
  boneAncestors,
  boneDescendants,
  degToRad,
  multiply,
  topoSortBones,
  transformPoint,
  worldTransforms,
} from './skeleton';
import { buildRig, TEMPLATES } from './templates';
import type { Bone } from './types';

const bone = (
  id: string,
  parentId: string | null,
  pivot: { x: number; y: number },
  visualAngle = 0,
  length = 100,
): Bone => ({ id, name: id, parentId, pivot, visualAngle, length, minAngle: -180, maxAngle: 180 });

describe('skeleton transforms', () => {
  it('composes parent rotation into the child position', () => {
    const bones: Bone[] = [bone('root', null, { x: 0, y: 0 }), bone('child', 'root', { x: 100, y: 0 })];
    const worlds = worldTransforms(bones, {
      root: { rotation: 90, x: 0, y: 0 },
      child: { rotation: 0, x: 0, y: 0 },
    });
    const childWorld = worlds.get('child')!;
    expect(childWorld.x).toBeCloseTo(0, 5);
    expect(childWorld.y).toBeCloseTo(100, 5);
  });

  it('adds child rotation on top of the parent', () => {
    const bones: Bone[] = [
      bone('a', null, { x: 0, y: 0 }),
      bone('b', 'a', { x: 0, y: 0 }),
      bone('c', 'b', { x: 0, y: 0 }),
    ];
    const worlds = worldTransforms(bones, {
      a: { rotation: 30, x: 0, y: 0 },
      b: { rotation: 20, x: 0, y: 0 },
      c: { rotation: 10, x: 0, y: 0 },
    });
    expect((worlds.get('c')!.rotation * 180) / Math.PI).toBeCloseTo(60, 5);
  });

  it('applies translation offsets before rotation of the parent', () => {
    const bones: Bone[] = [bone('root', null, { x: 50, y: 20 })];
    const worlds = worldTransforms(bones, { root: { rotation: 0, x: 10, y: -5 } });
    expect(worlds.get('root')!.x).toBeCloseTo(60, 5);
    expect(worlds.get('root')!.y).toBeCloseTo(15, 5);
  });

  it('orders bones parent-first even when the list is shuffled', () => {
    const bones: Bone[] = [
      bone('c', 'b', { x: 0, y: 0 }),
      bone('a', null, { x: 0, y: 0 }),
      bone('b', 'a', { x: 0, y: 0 }),
    ];
    expect(topoSortBones(bones).map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('survives a parent cycle without hanging', () => {
    const bones: Bone[] = [bone('a', 'b', { x: 0, y: 0 }), bone('b', 'a', { x: 0, y: 0 })];
    const ordered = topoSortBones(bones);
    expect(ordered.length).toBeLessThanOrEqual(2);
  });

  it('lists ancestors and descendants', () => {
    const bones: Bone[] = [
      bone('a', null, { x: 0, y: 0 }),
      bone('b', 'a', { x: 0, y: 0 }),
      bone('c', 'b', { x: 0, y: 0 }),
    ];
    const map = new Map(bones.map((b) => [b.id, b]));
    expect(boneAncestors(map, 'c')).toEqual(['b', 'a']);
    expect(boneDescendants(map, 'a')).toEqual(['b', 'c']);
  });

  it('multiply matches transformPoint composition', () => {
    const parent = { x: 30, y: -10, rotation: degToRad(45), scaleX: 1, scaleY: 1 };
    const child = { x: 20, y: 5, rotation: degToRad(10), scaleX: 1, scaleY: 1 };
    const combined = multiply(parent, child);
    const direct = transformPoint(combined, { x: 0, y: 0 });
    const indirect = transformPoint(parent, transformPoint(child, { x: 0, y: 0 }));
    expect(direct.x).toBeCloseTo(indirect.x, 6);
    expect(direct.y).toBeCloseTo(indirect.y, 6);
  });
});

describe('rig templates', () => {
  it('every template builds a rig with bones, groups and parts', () => {
    for (const t of TEMPLATES) {
      const rig = t.build();
      expect(rig.bones.length).toBeGreaterThan(0);
      expect(rig.parts.length).toBeGreaterThan(0);
      expect(rig.groups.length).toBeGreaterThan(0);
    }
  });

  it('every part is bound to an existing bone', () => {
    for (const t of TEMPLATES) {
      const rig = t.build();
      const ids = new Set(rig.bones.map((b) => b.id));
      for (const part of rig.parts) {
        expect(ids.has(part.boneId)).toBe(true);
      }
    }
  });

  it('every group root bone exists', () => {
    for (const t of TEMPLATES) {
      const rig = t.build();
      const ids = new Set(rig.bones.map((b) => b.id));
      for (const g of rig.groups) {
        expect(ids.has(g.rootBoneId)).toBe(true);
      }
    }
  });

  it('part points form a usable polygon', () => {
    const rig = buildRig('fetus');
    for (const part of rig.parts) {
      expect(part.points.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('the four birth-mechanism joints exist on the mechanism template', () => {
    const rig = buildRig('mechanism');
    const names = rig.bones.map((b) => b.name);
    expect(names).toContain('胎头');
    expect(names).toContain('骨盆根');
    expect(names).toContain('宫颈');
    const head = rig.bones.find((b) => b.id === 'fetal_head')!;
    // Flexion needs a real backward range; extension needs forward range.
    expect(head.minAngle).toBeLessThan(-30);
    expect(head.maxAngle).toBeGreaterThan(30);
  });
});
