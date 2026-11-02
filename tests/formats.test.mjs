import test from 'node:test';
import assert from 'node:assert/strict';
import { clean, systemPrompt, userMessage } from '../server/services/deckai.mjs';

test('deck advice uses supported format rules and includes lands for legacy requests', () => {
  for (const format of ['commander', 'paupercommander', 'predh', 'duel', 'admiral']) {
    const context = clean({ kind: 'lands', deck: { format, landCount: 34, guide: { land: 37 } } });
    assert.equal(context.deck.format, format === 'admiral' ? 'commander' : format);
    assert.match(userMessage(context), /lands 34/);
    assert.match(userMessage(context), /common guide: lands 37/);
    assert.doesNotMatch(systemPrompt(context), /Admiral|Landing Zone|NO lands/);
  }
});
