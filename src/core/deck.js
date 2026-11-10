/* MM · 建牌组 + 洗牌（UMD，纯逻辑；依赖 Rng / Config） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rng.js'), require('./config.js'));
  } else {
    root.MM = root.MM || {};
    root.MM.Core = root.MM.Core || {};
    root.MM.Core.Deck = factory(root.MM.Core.Rng, root.MM.Core.Config);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Rng, Config) {
  'use strict';
  if (!Rng) { throw new Error('[MM] Deck requires MM.Core.Rng'); }
  if (!Config) { throw new Error('[MM] Deck requires MM.Core.Config'); }

  // 返回 [{ id, pairId, symbolId }]：先抽 pairs 个互不相同符号，各 2 张，洗牌后按下标赋 id
  function createDeck(options, legacyRng) {
    var pairs, rng, symbols;
    if (typeof options === 'number') {
      pairs = options;
      rng = legacyRng;
    } else {
      options = options || {};
      pairs = options.pairs;
      rng = options.rng;
      symbols = options.symbols;
    }
    symbols = symbols || Config.SYMBOLS;
    if (!rng || typeof rng !== 'function') { throw new TypeError('[MM] createDeck requires rng function'); }
    if (!(pairs > 0) || Math.floor(pairs) !== pairs) { throw new RangeError('[MM] createDeck requires positive integer pairs'); }
    if (pairs > symbols.length) { throw new RangeError('[MM] createDeck: pairs exceeds symbol pool'); }

    var pool = symbols.slice();
    Rng.shuffleInPlace(pool, rng);
    var picked = pool.slice(0, pairs);
    var cards = [];
    for (var i = 0; i < pairs; i += 1) {
      cards.push({ pairId: i, symbolId: picked[i].id });
      cards.push({ pairId: i, symbolId: picked[i].id });
    }
    Rng.shuffleInPlace(cards, rng);
    for (var k = 0; k < cards.length; k += 1) { cards[k].id = k; }
    return cards;
  }

  return { createDeck: createDeck };
});
