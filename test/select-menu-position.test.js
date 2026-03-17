import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSelectMenuPosition } from '../web/src/lib/select-menu-position.js';

test('computeSelectMenuPosition prefers opening above on narrow screens when there is space', () => {
  const position = computeSelectMenuPosition({
    rect: { left: 24, top: 520, bottom: 572, width: 320 },
    menuHeight: 300,
    viewportWidth: 430,
    viewportHeight: 900,
  });

  assert.equal(position.top, 216);
  assert.equal(position.left, 24);
  assert.equal(position.width, 320);
});

test('computeSelectMenuPosition falls back below on narrow screens without enough top space', () => {
  const position = computeSelectMenuPosition({
    rect: { left: 24, top: 120, bottom: 172, width: 320 },
    menuHeight: 300,
    viewportWidth: 430,
    viewportHeight: 900,
  });

  assert.equal(position.top, 176);
});

test('computeSelectMenuPosition keeps the menu inside the viewport horizontally', () => {
  const position = computeSelectMenuPosition({
    rect: { left: 500, top: 300, bottom: 352, width: 320 },
    menuHeight: 300,
    viewportWidth: 760,
    viewportHeight: 900,
  });

  assert.equal(position.left, 424);
});
