import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSmmPrice } from './smm-pricing.js';
import { getPublicCatalog, resolveCatalogPack } from './_catalog-map.js';

test('scales SMM prices proportionally from the catalog base quantity', () => {
  assert.equal(calculateSmmPrice(1_000, 1_000, 1_000), 1_000);
  assert.equal(calculateSmmPrice(10_000, 1_000, 1_000), 10_000);
  assert.equal(calculateSmmPrice(10_000, 10_000, 3_000), 3_000);
  assert.equal(calculateSmmPrice(1_000, 500, 15_000), 30_000);
});

test('rejects invalid SMM price inputs', () => {
  assert.equal(calculateSmmPrice(0, 1_000, 1_000), 0);
  assert.equal(calculateSmmPrice(1_000, 0, 1_000), 0);
  assert.equal(calculateSmmPrice(1_000.5, 1_000, 1_000), 0);
});

test('quotes customer-selected quantities for manually fulfilled SMM catalog items', () => {
  const pack = resolveCatalogPack('smm-telegram', 'smm_tg_comments_1k');
  assert.equal(pack.sora, null);
  assert.equal(pack.amount, 1_000);
  assert.equal(calculateSmmPrice(2_500, pack.amount, pack.priceUzs), 41_750);
});

test('uses the screenshot Telegram Stars and SMM price list', () => {
  assert.equal(resolveCatalogPack('tg-stars', 'tg_stars_50').priceUzs, 10_500);
  assert.equal(resolveCatalogPack('tg-stars', 'tg_stars_75').priceUzs, 15_750);
  assert.equal(resolveCatalogPack('smm-telegram', 'smm_tg_sub_1k').priceUzs, 3_400);
  assert.equal(resolveCatalogPack('smm-telegram', 'smm_tg_comments_1k').priceUzs, 16_700);
});

test('disabled packs are hidden publicly and rejected for checkout', () => {
  const disabledPackIds = ['pubg:pubg_60'];
  const publicPubg = getPublicCatalog({}, disabledPackIds).find((game) => game.id === 'pubg');
  const adminPubg = getPublicCatalog({}, disabledPackIds, true).find((game) => game.id === 'pubg');
  assert.equal(publicPubg.packs.some((pack) => pack.id === 'pubg_60'), false);
  assert.equal(adminPubg.packs.some((pack) => pack.id === 'pubg_60'), true);
  assert.equal(resolveCatalogPack('pubg', 'pubg_60', {}, disabledPackIds), null);
});

test('applies validated per-package price overrides to the public and checkout catalogs', () => {
  const overrides = { 'tg-stars': { tg_stars_50: 12_345 } };
  assert.equal(resolveCatalogPack('tg-stars', 'tg_stars_50', overrides).priceUzs, 12_345);
  const stars = getPublicCatalog(overrides).find((game) => game.id === 'tg-stars');
  assert.equal(stars.packs.find((pack) => pack.id === 'tg_stars_50').priceUzs, 12_345);
  assert.equal(resolveCatalogPack('tg-stars', 'tg_stars_50', { 'tg-stars': { tg_stars_50: -1 } }).priceUzs, 10_500);
});
