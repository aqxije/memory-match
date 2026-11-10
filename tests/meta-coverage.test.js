'use strict';

/**
 * AC-58 覆盖自检（I-07 增强）：
 * 1) 39 条 [L] AC 均有映射；
 * 2) AC-58 指定逻辑面均有映射；
 * 3) 映射的测试文件存在，且文件内确实出现该 AC 编号；
 * 4) 「关键用例」列中的用例名在真实 test('...') 名称集合中存在（支持「…」前缀匹配）；
 * 5) AC-COVERAGE 顶部统计（用例数/用例文件数/helpers 数）与实际一致（防 Q-12 复发）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = __dirname;
const COVERAGE_PATH = path.join(TESTS_DIR, 'AC-COVERAGE.md');

// SPEC §8 中全部 [L] 类 AC（39 条）
const REQUIRED_L_ACS = [
  'AC-01', 'AC-02', 'AC-03', 'AC-04',
  'AC-06', 'AC-07', 'AC-08', 'AC-09', 'AC-10', 'AC-11', 'AC-12', 'AC-13', 'AC-14',
  'AC-15', 'AC-16', 'AC-17', 'AC-18', 'AC-19',
  'AC-20', 'AC-21', 'AC-22', 'AC-23',
  'AC-25', 'AC-26', 'AC-27', 'AC-28', 'AC-29', 'AC-30', 'AC-31',
  'AC-33', 'AC-34',
  'AC-36', 'AC-37', 'AC-38', 'AC-39',
  'AC-56', 'AC-57', 'AC-58', 'AC-63',
];

// AC-58 明确要求覆盖的逻辑面
const AC58_REQUIRED_FACES = [
  'AC-06', 'AC-07', 'AC-09', 'AC-10', 'AC-12', 'AC-15', 'AC-16', 'AC-17',
  'AC-20', 'AC-21', 'AC-22', 'AC-23', 'AC-25', 'AC-26', 'AC-27', 'AC-33',
  'AC-37', 'AC-38', 'AC-63',
];

function readCoverage() {
  assert.ok(fs.existsSync(COVERAGE_PATH), 'tests/AC-COVERAGE.md 必须存在');
  return fs.readFileSync(COVERAGE_PATH, 'utf8');
}

/** 解析覆盖表：返回 [{ ac, files, caseNames, line }] */
function parseCoverageRows(text) {
  const rows = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!/^\|\s*AC-\d{2}\s*\|/.test(line)) continue;
    const cells = line.split('|').map(function (cell) { return cell.trim(); });
    const ac = cells[1];
    const filesCell = cells[3] || '';
    const casesCell = cells[4] || '';
    const files = filesCell.match(/tests\/[A-Za-z0-9._/-]+\.test\.js/g) || [];
    const caseNames = [];
    const namePattern = /「([^」]+)」/g;
    let match;
    while ((match = namePattern.exec(casesCell)) !== null) caseNames.push(match[1]);
    rows.push({ ac: ac, files: files, caseNames: caseNames, line: line });
  }
  return rows;
}

function listTestFiles() {
  return fs
    .readdirSync(TESTS_DIR)
    .filter(function (name) { return name.endsWith('.test.js'); })
    .map(function (name) { return path.join(TESTS_DIR, name); });
}

/** 收集真实 test('...') / test("...") 名称 */
function collectTestNames() {
  const names = new Set();
  const pattern = /(?:^|\n)\s*test\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const file of listTestFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(source)) !== null) names.add(match[2]);
  }
  return names;
}

test('AC-58 覆盖映射完整：39 条 [L] AC 均有测试映射', function () {
  const rows = parseCoverageRows(readCoverage());
  const mapped = new Set(rows.map(function (row) { return row.ac; }));

  const missing = REQUIRED_L_ACS.filter(function (ac) { return !mapped.has(ac); });
  assert.deepStrictEqual(missing, [], '缺少 [L] AC 映射: ' + missing.join(', '));
  assert.equal(REQUIRED_L_ACS.length, 39, '[L] AC 应为 39 条');
  assert.equal(rows.length, 39, '覆盖表应恰好 39 行 AC 映射，实际 ' + rows.length);
});

test('AC-58 指定逻辑面均有映射（AC-06/07/09/10/12/15/16/17/20/21/22/23/25/26/27/33/37/38/63）', function () {
  const rows = parseCoverageRows(readCoverage());
  const mapped = new Set(rows.map(function (row) { return row.ac; }));

  const missing = AC58_REQUIRED_FACES.filter(function (ac) { return !mapped.has(ac); });
  assert.deepStrictEqual(missing, [], '缺少 AC-58 指定逻辑面映射: ' + missing.join(', '));
});

test('AC-58 映射的测试文件存在，且文件内确实出现该 AC 编号（I-07）', function () {
  const rows = parseCoverageRows(readCoverage());
  for (const row of rows) {
    assert.ok(row.files.length >= 1, row.ac + ' 未映射任何测试文件');
    for (const file of row.files) {
      const fullPath = path.join(ROOT, file);
      assert.ok(fs.existsSync(fullPath), row.ac + ' 映射的测试文件不存在: ' + file);
      const source = fs.readFileSync(fullPath, 'utf8');
      assert.ok(source.includes(row.ac), row.ac + ' 映射到 ' + file + '，但该文件未出现 ' + row.ac + ' 编号');
    }
  }
});

test('AC-58 覆盖表关键用例名与真实 test() 名称一致（支持省略号前缀，I-07）', function () {
  const rows = parseCoverageRows(readCoverage());
  const actualNames = Array.from(collectTestNames());
  assert.ok(actualNames.length >= 100, '应收集到 ≥100 个 test() 名称，实际 ' + actualNames.length);

  const missing = [];
  for (const row of rows) {
    for (const caseName of row.caseNames) {
      const isPrefix = caseName.endsWith('…');
      const target = isPrefix ? caseName.slice(0, -1) : caseName;
      const found = isPrefix
        ? actualNames.some(function (name) { return name.startsWith(target); })
        : actualNames.some(function (name) { return name === target; });
      if (!found) missing.push(row.ac + ' → 「' + caseName + '」');
    }
  }
  assert.deepStrictEqual(missing, [], '映射的用例名不存在（改名/删除后需同步 AC-COVERAGE）: ' + missing.join('; '));
});

test('AC-58 AC-COVERAGE 顶部统计与实际一致（防 Q-12 复发）', function () {
  const text = readCoverage();
  const testFiles = listTestFiles();
  const helperFiles = fs
    .readdirSync(path.join(TESTS_DIR, 'helpers'))
    .filter(function (name) { return name.endsWith('.js'); });
  const actualCaseCount = collectTestNames().size;

  const caseCountMatch = text.match(/\|\s*用例数\s*\|\s*(\d+)/);
  assert.ok(caseCountMatch, 'AC-COVERAGE 缺少「用例数」统计行');
  assert.equal(Number(caseCountMatch[1]), actualCaseCount, 'AC-COVERAGE 用例数与实际 test() 数量不一致');

  const fileCountMatch = text.match(/\|\s*测试文件\s*\|\s*(\d+)\s*个用例文件\s*\+\s*(\d+)\s*个 helpers/);
  assert.ok(fileCountMatch, 'AC-COVERAGE 缺少「测试文件 | N 个用例文件 + N 个 helpers」统计行');
  assert.equal(Number(fileCountMatch[1]), testFiles.length, 'AC-COVERAGE 用例文件数与实际不一致');
  assert.equal(Number(fileCountMatch[2]), helperFiles.length, 'AC-COVERAGE helpers 数与实际不一致');
});

test('AC-58 用例文件齐全：SPEC §14 建议的测试文件与 helpers 均存在', function () {
  const expectedFiles = [
    'tests/cards.test.js',
    'tests/state-machine.test.js',
    'tests/scoring.test.js',
    'tests/stars.test.js',
    'tests/leaderboard.test.js',
    'tests/timer.test.js',
    'tests/settings.test.js',
    'tests/config.test.js',
    'tests/events.test.js',
    'tests/repo.test.js',
    'tests/render-model.test.js',
    'tests/meta-coverage.test.js',
  ];
  for (const file of expectedFiles) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), '缺少测试文件: ' + file);
  }
  for (const helper of ['fake-clock.js', 'fake-storage.js', 'seeded-rng.js', 'recorder.js', 'harness.js']) {
    assert.ok(fs.existsSync(path.join(TESTS_DIR, 'helpers', helper)), '缺少 helper: ' + helper);
  }
});
