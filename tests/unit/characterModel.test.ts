import { describe, expect, it } from 'vitest';
import { AnimationClip, Group, QuaternionKeyframeTrack } from 'three';
import { CharacterModel, placeCharacter } from '@/game/entities/CharacterModel';
import type { LoadedCharacter } from '@/game/assets/AssetLoader';

/**
 * Animation state machine tests.
 *
 * The GLB round-trip is covered in `assetPipeline.test.ts`; here the model is fed
 * synthetic clips so state transitions can be asserted exactly, without waiting
 * for real asset IO.
 */
function clip(name: string, duration: number, bone = 'root'): AnimationClip {
  return new AnimationClip(name, duration, [
    new QuaternionKeyframeTrack(
      `${bone}.quaternion`,
      [0, duration],
      [0, 0, 0, 1, 0, 0.3826834, 0, 0.9238795],
    ),
  ]);
}

function fakeCharacter(clipNames: readonly string[], duration = 0.5): LoadedCharacter {
  const scene = new Group();
  scene.name = 'test-character';
  return { scene, animations: clipNames.map((name) => clip(name, duration)) };
}

function tick(model: CharacterModel, seconds: number, speed = 0): void {
  const step = 1 / 60;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) model.update(step, speed);
}

describe('CharacterModel', () => {
  it('starts idle and switches locomotion by speed', () => {
    const model = new CharacterModel(fakeCharacter(['idle', 'walk', 'run', 'attack', 'dodge', 'hit', 'death']));
    expect(model.state).toBe('idle');

    model.update(1 / 60, 1.5);
    expect(model.state).toBe('walk');

    model.update(1 / 60, 6);
    expect(model.state).toBe('run');

    model.update(1 / 60, 0);
    expect(model.state).toBe('idle');
    model.dispose();
  });

  it('plays a one-shot attack and returns to locomotion when the clip ends', () => {
    const model = new CharacterModel(
      fakeCharacter(['idle', 'walk', 'run', 'attack', 'dodge', 'hit', 'death']),
      { attackSeconds: 0.28 },
    );
    expect(model.playAttack()).toBe(true);
    expect(model.state).toBe('attack');

    // Re-triggering while the swing is in progress is ignored (no animation spam).
    expect(model.playAttack()).toBe(false);

    tick(model, 0.9);
    expect(model.state).toBe('idle');
    model.dispose();
  });

  it('does not let chip damage interrupt a swing', () => {
    const model = new CharacterModel(fakeCharacter(['idle', 'attack', 'dodge', 'hit', 'death']));
    model.playAttack();
    expect(model.playHit()).toBe(false);
    expect(model.state).toBe('attack');
    model.dispose();
  });

  it('hit and dodge are one-shots that own the body', () => {
    const model = new CharacterModel(fakeCharacter(['idle', 'attack', 'dodge', 'hit', 'death']));
    expect(model.playDodge()).toBe(true);
    expect(model.state).toBe('dodge');
    tick(model, 1);
    expect(model.state).toBe('idle');

    expect(model.playHit()).toBe(true);
    expect(model.state).toBe('hit');
    tick(model, 1);
    expect(model.state).toBe('idle');
    model.dispose();
  });

  it('death is terminal', () => {
    const model = new CharacterModel(fakeCharacter(['idle', 'attack', 'hit', 'death']));
    model.playDeath();
    expect(model.isDead).toBe(true);
    expect(model.state).toBe('death');
    expect(model.playAttack()).toBe(false);
    expect(model.playDodge()).toBe(false);
    model.update(1 / 60, 9);
    expect(model.state).toBe('death');
    model.dispose();
  });

  it('survives a model without the optional clips', () => {
    const model = new CharacterModel(fakeCharacter(['idle']));
    expect(model.playAttack()).toBe(false);
    expect(model.playDodge()).toBe(false);
    model.update(1 / 60, 5);
    // Missing walk/run must not break the state machine, only skip the visual.
    expect(['idle', 'walk', 'run']).toContain(model.state);
    expect(() => model.playDeath()).not.toThrow();
    model.dispose();
  });

  it('reports the clips it actually loaded and its eye height', () => {
    const model = new CharacterModel(fakeCharacter(['idle', 'walk']), { eyeHeight: 1.4 });
    expect(model.availableClips).toEqual(['idle', 'walk']);
    expect(model.eyeHeight).toBe(1.4);
    expect(model.eye).toBe(1.4);
    model.dispose();
  });

  it('places the model at the feet position with a yaw', () => {
    const model = new CharacterModel(fakeCharacter(['idle']));
    placeCharacter(model.group, { x: 4, y: 0.05, z: -2 }, Math.PI / 3);
    expect(model.group.position.x).toBe(4);
    expect(model.group.position.y).toBeCloseTo(0.05, 6);
    expect(model.group.position.z).toBe(-2);
    expect(model.group.rotation.y).toBeCloseTo(Math.PI / 3, 6);
    model.dispose();
  });
});
