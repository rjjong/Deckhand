import test from 'node:test';
import assert from 'node:assert/strict';
import { clean as cleanJudge, systemPrompt as judgePrompt } from '../server/services/judge.mjs';
import { clean as cleanDeck, systemPrompt as deckPrompt } from '../server/services/deckai.mjs';

test('AI endpoints normalize obsolete language choices to English', () => {
  for (const lang of [undefined, 'en', 'nl']) {
    assert.equal(cleanJudge({ q: 'Can I cast this?', lang }).lang, 'en');
    const deck = cleanDeck({ lang });
    assert.equal(deck.lang, 'en');
    assert.match(judgePrompt(lang), /(?:Write|Reply) in English/);
    assert.match(deckPrompt(deck), /Write in plain English/);
    assert.doesNotMatch(judgePrompt(lang) + deckPrompt(deck), /Dutch/);
  }
});
