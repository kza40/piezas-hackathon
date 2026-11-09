// CSV cells for the field export (R-026): no network. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from './data/export';

test('text a spreadsheet would run as a formula is saved as plain text', () => {
  for (const v of ['=1+1', '+1', '-North probe', '@SUM(A1)']) assert.equal(csvCell(v), `'${v}`);
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`, 'quoted when it holds a quote');
  assert.equal(csvCell('=SUM(A1,B1)'), `"'=SUM(A1,B1)"`, 'quoted when it holds a comma');
});

test('numbers stay numbers, including below-zero temperatures', () => {
  assert.equal(csvCell(-2.5), '-2.5');
  assert.equal(csvCell(0), '0');
  assert.equal(csvCell(31.2), '31.2');
});

test('commas, quotes and line breaks are quoted; empty values are blank', () => {
  assert.equal(csvCell('Sandy loam, mulched'), '"Sandy loam, mulched"');
  assert.equal(csvCell('the "north" probe'), '"the ""north"" probe"');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(''), '');
});
