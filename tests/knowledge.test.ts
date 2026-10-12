import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guide, executeTool, getTurnaround, searchKiosk, searchPrices, staffAvailability } from '../server/knowledge.js';
import { instructions, sessionConfig } from '../server/agents.js';

test('workbook import retains all seven stores and source rows', () => {
  assert.equal(guide.stores.length, 7);
  assert.equal(guide.prices.length, 1098);
  assert.equal(guide.turnaround.length, 73);
  assert.equal(guide.kiosk.length, 27);
  assert.ok(guide.prices.every(row => row.source.sheet === 'Price List' && row.source.row >= 2));
});
test('price lookup stays in the selected business and pricing group', () => {
  for (const store of guide.stores) {
    const results = searchPrices(store.id, 'shirt');
    assert.ok(results.matches.length > 0);
    assert.ok(results.matches.every(row => row.business === store.business));
    assert.ok(results.matches.every(row => row.group === store.priceGroup || row.group === 'All Rite stores'));
    for (const row of results.matches) {
      const original = guide.prices.find(source => source.source.row === row.source.row)!;
      if (row.quoteable) assert.equal(row.price, original.price);
    }
  }
});
test('zero and specialty prices are never quoted as free services', () => {
  const alterations = searchPrices('solon', 'waist in out', 'Alterations');
  const unset = alterations.matches.find(row => row.item === 'Waist in/out')!;
  assert.equal(unset.quoteable, false);
  assert.equal(unset.price, null);
  const wedding = searchPrices('fox-chapel', 'wedding gown');
  assert.ok(wedding.matches.filter(row => row.item.includes('Wedding Gown')).every(row => !row.quoteable && row.price === null));
});
test('percentage upcharges preserve units and contradictory store scope is withheld', () => {
  const warren = searchPrices('warren', 'fancy', 'Upcharges').matches.find(row => row.item === 'Fancy')!;
  assert.equal(warren.price, '50%');
  assert.equal(warren.unit, 'percent_upcharge');
  const solon = searchPrices('solon', 'fancy', 'Upcharges').matches.find(row => row.item === 'Fancy')!;
  assert.equal(solon.quoteable, false);
  assert.equal(solon.price, null);
  assert.equal(solon.scopeConflict, true);
});
test('missing price search does not produce an invented answer', () => {
  const result = searchPrices('solon', 'zxqnotagarment');
  assert.equal(result.status, 'not_found');
  assert.equal(result.matches.length, 0);
});
test('cutoff minute is inclusive and next minute uses the later schedule', () => {
  const before = getTurnaround('solon', 'Monday', '08:45');
  const after = getTurnaround('solon', 'Monday', '08:46');
  assert.ok('options' in before && before.options);
  assert.ok('options' in after && after.options);
  assert.equal(before.options[0].readyDay, 'Wednesday');
  assert.equal(after.options[0].readyDay, 'Thursday');
  const parma = getTurnaround('parma', 'Monday', '11:01');
  assert.ok('options' in parma && parma.options);
  assert.equal(parma.options[0].readyAfter, '4:00 PM');
});
test('unknown drop-off time returns both before and after cutoff options', () => {
  const result = getTurnaround('solon', 'Monday');
  assert.ok('options' in result && result.options);
  assert.deepEqual(result.options.map(row => row.readyDay), ['Wednesday', 'Thursday']);
  assert.match(result.holidayCaveat!, /No holiday closure calendar/);
});
test('non-selectable options never leak ready dates and earliest selectable result comes first', () => {
  const thursday = getTurnaround('solon', 'Thursday', '08:45');
  assert.ok('options' in thursday && thursday.options);
  assert.deepEqual(thursday.options.map(row => row.readyDay), ['Saturday', 'Monday']);
  const late = getTurnaround('solon', 'Thursday', '08:46');
  assert.ok('options' in late && late.options);
  assert.equal(late.options.length, 1);
  assert.equal(late.options[0].readyDay, 'Tuesday');
  assert.equal(late.fasterServiceRequiresStaff, true);
});
test('closed Sunday stores override conflicting turnaround rows', () => {
  for (const id of ['warren', 'fox-chapel']) {
    const result = getTurnaround(id, 'Sunday', '10:00');
    assert.equal(result.status, 'needs_staff');
    assert.ok('reason' in result && result.reason.includes('closed Sunday'));
    assert.equal('options' in result, false);
  }
});
test('unsupported specialty service escalates, but Warren alterations have a schedule', () => {
  assert.equal(getTurnaround('solon', 'Monday', '08:30', 'alterations').status, 'needs_staff');
  assert.equal(getTurnaround('warren', 'Monday', '08:30', 'alterations').status, 'ok');
});
test('stores without kiosks cannot accept a drop-off outside public opening hours', () => {
  assert.equal(getTurnaround('fox-chapel', 'Monday', '16:00').status, 'needs_staff');
  assert.equal(getTurnaround('fox-chapel', 'Tuesday', '17:30').status, 'ok');
  assert.equal(getTurnaround('warren', 'Saturday', '08:30').status, 'needs_staff');
  assert.equal(getTurnaround('warren', 'Saturday', '15:00').status, 'needs_staff');
});
test('kiosk lookup respects store availability and grounds PIN instructions', () => {
  const result = searchKiosk('solon', 'PIN');
  assert.ok('matches' in result);
  assert.match(result.matches[0].answer!, /does not use a PIN/);
  const noKiosk = searchKiosk('fox-chapel', 'drop off');
  assert.equal(noKiosk.status, 'no_kiosk');
  assert.ok(noKiosk.answer?.includes('no kiosk or drop box'));
});
test('staff availability uses Eastern time and daylight saving rules', () => {
  assert.equal(staffAvailability(new Date('2026-07-01T10:59:00Z')).available, false);
  assert.equal(staffAvailability(new Date('2026-07-01T11:00:00Z')).available, true);
  assert.equal(staffAvailability(new Date('2026-07-02T01:00:00Z')).available, false);
  assert.equal(staffAvailability(new Date('2026-01-01T11:59:00Z')).available, false);
  assert.equal(staffAvailability(new Date('2026-01-01T12:00:00Z')).available, true);
});
test('tools validate store IDs, times, unknown tools, and call actions', () => {
  assert.throws(() => executeTool('search_prices', { store_id: 'made-up', query: 'shirt' }));
  assert.throws(() => executeTool('get_turnaround', { store_id: 'solon', day: 'Monday', time: '26:99' }));
  assert.throws(() => executeTool('delete_data', {}));
  assert.deepEqual(executeTool('end_call', { reason: 'Caller said goodbye' }), { status: 'ok', action: 'end', reason: 'Caller said goodbye' });
  assert.deepEqual(executeTool('transfer_call', { reason: 'Requested Gus' }), { status: 'ok', action: 'transfer', destination: 'gus', reason: 'Requested Gus', demo: true });
});
test('transfer uses a new voice, remains grounded, and cannot recurse', () => {
  const maya = sessionConfig('maya', 'solon', 'gpt-realtime');
  const gus = sessionConfig('gus', 'solon', 'gpt-realtime');
  assert.equal(maya.audio.output.voice, 'marin');
  assert.equal(gus.audio.output.voice, 'cedar');
  assert.ok(maya.tools.some(tool => tool.name === 'transfer_call'));
  assert.ok(!gus.tools.some(tool => tool.name === 'transfer_call'));
  assert.ok(gus.tools.some(tool => tool.name === 'search_prices'));
  assert.match(instructions('gus', 'solon'), /grumpy/);
  assert.match(instructions('gus', 'solon'), /no holiday calendar/);
  assert.match(instructions('maya', 'solon'), /REAL|Real staff routing/);
});
