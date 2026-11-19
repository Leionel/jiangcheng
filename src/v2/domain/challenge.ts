import type { RegionId, SaveV2 } from './types';

export type ChallengeCode = {
  v: 2;
  region: RegionId;
  seed: string;
  party: Array<{ name: string; path: string; level: number; evolution: string | null }>;
  date: string;
};

function encodeBase64Url(text: string): string {
  return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(padded)));
}

export function buildChallengeCode(save: SaveV2, seed = 'preview'): string {
  const party = save.party.ids
    .map((id) => save.collection.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      name: item.name,
      path: item.buildPath,
      level: item.level,
      evolution: item.evolutionId ?? null,
    }));
  const code: ChallengeCode = {
    v: 2,
    region: save.activeRegionId,
    seed,
    party,
    date: new Date().toISOString().slice(0, 10),
  };
  return `JCM2-${encodeBase64Url(JSON.stringify(code))}`;
}

export function parseChallengeCode(text: string): ChallengeCode | null {
  const match = /^JCM2-([A-Za-z0-9_-]+)$/.exec(text.trim());
  if (!match) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(match[1]));
    if (!parsed || parsed.v !== 2 || typeof parsed.seed !== 'string') return null;
    return parsed as ChallengeCode;
  } catch {
    return null;
  }
}

