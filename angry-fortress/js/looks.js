// 깡단 옷장: what a captain wears. Looks are only drawn, never simulated, so two phones may
// disagree about them without any harm to the match.
//   hat    on the captain's head
//   cart   the paint on the tub cart
//   trail  the marks a nut leaves in the air
// Items open with stars from 깡단 원정 (campaign.js). `pack` items come with the 깡단 후원 팩.
import { storage } from './util.js';

export const LOOKS = {
  hat: [
    { id: 'acorn', name: '도토리 모자', stars: 0 },
    { id: 'leaf', name: '나뭇잎 모자', stars: 2 },
    { id: 'mushroom', name: '버섯 모자', stars: 6 },
    { id: 'straw', name: '밀짚모자', stars: 12 },
    { id: 'pinecone', name: '솔방울 투구', stars: 20 },
    { id: 'crown', name: '황금 도토리 왕관', stars: 36 },
    { id: 'ribbon', name: '깡단 리본', pack: true },
  ],
  cart: [
    { id: 'wood', name: '나무 수레', stars: 0 },
    { id: 'red', name: '빨간 수레', stars: 4 },
    { id: 'sky', name: '하늘 수레', stars: 9 },
    { id: 'leaf', name: '풀잎 수레', stars: 16 },
    { id: 'gold', name: '황금 수레', stars: 30 },
    { id: 'berry', name: '산딸기 수레', pack: true },
  ],
  trail: [
    { id: 'dots', name: '하얀 점', stars: 0 },
    { id: 'leaf', name: '나뭇잎 바람', stars: 8 },
    { id: 'star', name: '별가루', stars: 14 },
    { id: 'heart', name: '하트', stars: 25 },
    { id: 'rainbow', name: '무지개', pack: true },
  ],
};
export const KINDS = ['hat', 'cart', 'trail'];
export const KIND_NAME = { hat: '모자', cart: '수레', trail: '발사 자국' };
export const DEFAULT_LOOK = { hat: 'acorn', cart: 'wood', trail: 'dots' };

const byId = (kind, id) => LOOKS[kind].find((it) => it.id === id);

// Anything from outside (a friend's phone, old storage) goes through here.
export function cleanLook(v) {
  const out = { ...DEFAULT_LOOK };
  if (v && typeof v === 'object') for (const k of KINDS) if (typeof v[k] === 'string' && byId(k, v[k])) out[k] = v[k];
  return out;
}

export function isOpen(item, stars, owned) {
  if (item.pack) return !!(owned && owned.pack);
  return stars >= (item.stars || 0);
}

export function myLook() {
  return cleanLook(storage.get('af.look', DEFAULT_LOOK));
}

export function setMyLook(look) {
  storage.set('af.look', cleanLook(look));
}

// Items that just opened at this star count (to celebrate on the result screen).
export function newlyOpened(before, after) {
  const out = [];
  for (const k of KINDS) for (const it of LOOKS[k]) if (!it.pack && it.stars > before && it.stars <= after) out.push({ kind: k, ...it });
  return out;
}
