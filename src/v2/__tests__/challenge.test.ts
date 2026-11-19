import { describe, expect, it } from 'vitest';
import { buildChallengeCode, parseChallengeCode } from '../domain/challenge';
import { createDefaultSave } from '../domain/save';

describe('Batch 2：挑战码/分享', () => {
  it('挑战码可解码，不包含照片/位置/密钥', () => {
    const save = createDefaultSave(1);
    const code = buildChallengeCode(save, 'seed-42');
    expect(code.startsWith('JCM2-')).toBe(true);
    const parsed = parseChallengeCode(code);
    expect(parsed?.seed).toBe('seed-42');
    expect(parsed?.party).toHaveLength(3);
    expect(code).not.toContain('data:image');
    expect(JSON.stringify(parsed)).not.toMatch(/password|key|apikey/i);
  });

  it('损坏的挑战码返回 null', () => {
    expect(parseChallengeCode('not-a-code')).toBeNull();
    expect(parseChallengeCode('JCM2-%%%%')).toBeNull();
  });
});
