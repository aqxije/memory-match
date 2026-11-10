'use strict';

/**
 * 工程约束：AC-56（零依赖/无构建）、AC-57（Node 无 DOM 可加载）、S-05/Q-11（全仓安全约束扫描）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  setup,
  snapshot,
  unmatchedPairs,
  playAllPairs,
  requireCore,
} = require('./helpers/harness.js');
const { createSeededRng } = require('../src/core/rng.js');
const { computeStars, computeMatchScore } = require('../src/core/scoring.js');
const { createLeaderboard } = require('../src/core/leaderboard.js');
const { createFakeStorage } = require('./helpers/fake-storage.js');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const CORE_DIR = path.join(SRC_DIR, 'core');
const STYLES_DIR = path.join(ROOT, 'styles');

/** 去掉 JS 注释（行注释 + 块注释；避免误伤 http:// 中的 //） */
function stripJsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 去掉 HTML 注释 */
function stripHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

/** 去掉 CSS 注释 */
function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function listFilesRecursive(dir, predicate) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      result.push.apply(result, listFilesRecursive(full, predicate));
    } else if (predicate(full)) {
      result.push(full);
    }
  }
  return result;
}

function coreFiles() {
  assert.ok(fs.existsSync(CORE_DIR), 'src/core 目录必须存在');
  return fs.readdirSync(CORE_DIR).filter(function (name) { return name.endsWith('.js'); });
}

function rel(file) {
  return path.relative(ROOT, file);
}

// ---------------------------------------------------------------------------
// AC-56 零依赖 / 无构建
// ---------------------------------------------------------------------------

test('AC-56 零依赖：无 node_modules、无构建配置、package.json dependencies 为空', function () {
  assert.equal(fs.existsSync(path.join(ROOT, 'node_modules')), false, '不得存在 node_modules');

  const packagePath = path.join(ROOT, 'package.json');
  if (fs.existsSync(packagePath)) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    assert.deepStrictEqual(packageJson.dependencies || {}, {}, 'package.json dependencies 必须为空');
    assert.deepStrictEqual(packageJson.devDependencies || {}, {}, '不得有第三方 devDependencies');
    assert.equal(
      Boolean(packageJson.scripts && packageJson.scripts.build),
      false,
      '不得有构建步骤（build script）'
    );
  }

  for (const name of ['vite.config.js', 'webpack.config.js', 'rollup.config.js', 'tsconfig.json']) {
    assert.equal(fs.existsSync(path.join(ROOT, name)), false, '不得存在构建配置文件 ' + name);
  }
  assert.equal(fs.existsSync(path.join(SRC_DIR, 'node_modules')), false);
});

test('AC-56 core 只 require 相对路径（无第三方运行时依赖），且不使用 ES module', function () {
  const files = coreFiles();
  assert.ok(files.length >= 8, 'core 应包含 8 个模块，实际 ' + files.length);

  for (const file of files) {
    const source = stripJsComments(fs.readFileSync(path.join(CORE_DIR, file), 'utf8'));
    const requirePattern = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match;
    while ((match = requirePattern.exec(source)) !== null) {
      assert.ok(
        match[1].startsWith('./') || match[1].startsWith('../'),
        file + ' 引入了非相对路径依赖: ' + match[1]
      );
    }
    assert.equal(/\bimport\s+[^('"\s]/.test(source), false, file + ' 不得使用 ES module import');
    assert.equal(/\bexport\s+/.test(source), false, file + ' 不得使用 ES module export');
  }
});

// ---------------------------------------------------------------------------
// AC-57 Node 无 DOM 可加载
// ---------------------------------------------------------------------------

test('AC-57 Node 无 DOM 可加载：core 全部模块 require 成功且导出完整', function () {
  assert.equal(typeof globalThis.window, 'undefined', 'Node 环境不应有 window');
  assert.equal(typeof globalThis.document, 'undefined', 'Node 环境不应有 document');

  const core = requireCore();
  assert.equal(typeof core.rng.createSeededRng, 'function');
  assert.equal(typeof core.rng.randomInt, 'function');
  assert.equal(typeof core.rng.shuffleInPlace, 'function');
  assert.equal(typeof core.deck.createDeck, 'function');
  assert.equal(typeof core.scoring.computeMatchScore, 'function');
  assert.equal(typeof core.scoring.computeMoveStars, 'function');
  assert.equal(typeof core.scoring.computeTimeStars, 'function');
  assert.equal(typeof core.scoring.computeStars, 'function');
  assert.equal(typeof core.leaderboard.createLeaderboard, 'function');
  assert.equal(typeof core.leaderboard.compareEntries, 'function');
  assert.equal(typeof core.leaderboard.rankEntries, 'function');
  assert.equal(typeof core.leaderboard.validateEntry, 'function');
  assert.equal(typeof core.settings.createSettings, 'function');
  assert.equal(typeof core.timer.createTimer, 'function');
  assert.equal(typeof core.game.createGame, 'function');
  assert.ok(core.config.DIFFICULTIES && core.config.SYMBOLS && core.config.CONSTANTS);
});

test('AC-57 core 源码不含 DOM/宿主全局引用（logic.md §16.3）', function () {
  const forbidden = [
    { pattern: /\bdocument\b/, name: 'document' },
    { pattern: /\bwindow\b/, name: 'window' },
    { pattern: /\blocalStorage\b/, name: 'localStorage' },
    { pattern: /\bnavigator\b/, name: 'navigator' },
    { pattern: /\brequestAnimationFrame\b/, name: 'requestAnimationFrame' },
    { pattern: /\binnerHTML\b/, name: 'innerHTML' },
    { pattern: /\beval\s*\(/, name: 'eval(' },
  ];

  for (const file of coreFiles()) {
    const source = stripJsComments(fs.readFileSync(path.join(CORE_DIR, file), 'utf8'));
    for (const rule of forbidden) {
      assert.equal(rule.pattern.test(source), false, file + ' 含禁用标识: ' + rule.name);
    }
  }
});

test('AC-57 冒烟：Node 中可构造牌组 → 翻牌 → 判定 → 计分 → 星级 → 榜单排序', function () {
  const deck = require('../src/core/deck.js');
  const deckCards = deck.createDeck({ pairs: 6, rng: createSeededRng(42) });
  assert.equal(deckCards.length, 12);

  const { game, timer } = setup();
  game.start();
  const pair = unmatchedPairs(game)[0];
  game.flip(pair[0].id);
  game.flip(pair[1].id);
  timer.advance(0);
  assert.equal(snapshot(game).score, 100);
  assert.equal(computeMatchScore(1), 100);

  playAllPairs(game, timer);
  const finalSnapshot = snapshot(game);
  assert.equal(finalSnapshot.state, 'result');
  assert.equal(finalSnapshot.stars, computeStars({ pairs: 6, moves: 6, timeMs: finalSnapshot.timeMs }));

  const leaderboard = createLeaderboard({ storage: createFakeStorage() });
  leaderboard.add('easy', {
    score: finalSnapshot.score,
    moves: finalSnapshot.moves,
    timeMs: finalSnapshot.timeMs,
    stars: finalSnapshot.stars,
    completedAt: new Date(0).toISOString(),
  });
  assert.equal(leaderboard.list('easy').length, 1);
  assert.equal(leaderboard.best('easy'), finalSnapshot.score);
});

// ---------------------------------------------------------------------------
// S-05 / Q-11：安全约束扫描扩到全仓（index.html + src/**/*.js，排除注释）
// ---------------------------------------------------------------------------

const SECURITY_RULES = [
  { pattern: /\beval\s*\(/, name: 'eval(' },
  { pattern: /\bnew\s+Function\b/, name: 'new Function' },
  { pattern: /\binnerHTML\b/, name: 'innerHTML' },
  { pattern: /\bfetch\s*\(/, name: 'fetch(' },
  { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest' },
  { pattern: /\bimport\s*\(/, name: 'import(' },
  { pattern: /https?:\/\//, name: '外部 URL（http/https）', allow: /https?:\/\/www\.w3\.org\// },
  { pattern: /type\s*=\s*["']module["']/, name: 'type="module"' },
];

function assertNoSecurityViolation(source, label) {
  for (const rule of SECURITY_RULES) {
    if (rule.allow) {
      const matches = source.match(new RegExp(rule.pattern.source, 'g')) || [];
      const violations = matches.filter(function (match) { return !rule.allow.test(match); });
      assert.equal(violations.length, 0, label + ' 含禁用模式: ' + rule.name + ' → ' + violations.join(', '));
    } else {
      assert.equal(rule.pattern.test(source), false, label + ' 含禁用模式: ' + rule.name);
    }
  }
}

test('S-05/Q-11 全仓安全约束：index.html + src/**/*.js 无 eval/new Function/innerHTML/fetch/XMLHttpRequest/import(/外部URL/type=module（排除注释）', function () {
  const indexHtml = path.join(ROOT, 'index.html');
  assert.ok(fs.existsSync(indexHtml), 'index.html 必须存在');
  assertNoSecurityViolation(stripHtmlComments(fs.readFileSync(indexHtml, 'utf8')), 'index.html');

  const jsFiles = listFilesRecursive(SRC_DIR, function (file) { return file.endsWith('.js'); });
  assert.ok(jsFiles.length >= 15, 'src 下应有 ≥15 个 JS 文件（8 core + 7 platform），实际 ' + jsFiles.length);
  for (const file of jsFiles) {
    assertNoSecurityViolation(stripJsComments(fs.readFileSync(file, 'utf8')), rel(file));
  }
});

test('S-05/Q-11 styles 无外部 URL 引用（零外部请求）', function () {
  const cssFiles = listFilesRecursive(STYLES_DIR, function (file) { return file.endsWith('.css'); });
  assert.ok(cssFiles.length >= 4, 'styles 下应有 ≥4 个 CSS 文件，实际 ' + cssFiles.length);
  for (const file of cssFiles) {
    const source = stripCssComments(fs.readFileSync(file, 'utf8'));
    const urls = source.match(/https?:\/\//g) || [];
    assert.deepStrictEqual(urls, [], rel(file) + ' 含外部 URL 引用（应为零外部请求）');
  }
});
