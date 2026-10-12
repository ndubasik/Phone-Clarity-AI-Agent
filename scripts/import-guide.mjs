import ExcelJS from 'exceljs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';

const input = resolve(process.argv[2] || 'data/Rite_Don_Royal_Store_Guide_2.xlsx');
const output = resolve(process.argv[3] || 'data/guide.json');
const bytes = await readFile(input);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(bytes);
const cell = (sheet, row, col) => {
  const value = workbook.getWorksheet(sheet).getCell(row, col).value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    // Never evaluate workbook formulas or treat document content as code.
    if ('formula' in value || 'sharedFormula' in value) return value.result ?? null;
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    if ('text' in value) return value.text;
  }
  return value;
};
const text = (sheet, row, col) => String(cell(sheet, row, col) ?? '').trim();
const source = (sheet, row) => ({ sheet, row });
const ids = ['shaker-heights', 'highland-heights', 'solon', 'parma', 'broadview-heights', 'warren', 'fox-chapel'];
const stores = ids.map((id, i) => {
  const row = 34 + i;
  const values = Array.from({ length: 11 }, (_, n) => text('Store Guide', row, n + 1));
  const [business, name, address, phone, publicHours, staffedHours, kiosk, tailorHours, priceGroup, turnaroundGroup, system] = values;
  if (!name || !priceGroup || !turnaroundGroup) throw new Error(`Incomplete store at row ${row}`);
  return { id, business, name, address, phone, publicHours, staffedHours, kiosk, tailorHours, priceGroup, turnaroundGroup, system, source: source('Store Guide', row) };
});
const prices = [];
for (let row = 2; row <= workbook.getWorksheet('Price List').rowCount; row++) {
  if (!text('Price List', row, 4)) continue;
  prices.push({ business: text('Price List', row, 1), group: text('Price List', row, 2), category: text('Price List', row, 3), item: text('Price List', row, 4), price: cell('Price List', row, 5), description: text('Price List', row, 6), action: text('Price List', row, 7), source: source('Price List', row) });
}
const turnaround = [];
for (let row = 2; row <= workbook.getWorksheet('Turnaround').rowCount; row++) {
  if (!text('Turnaround', row, 2)) continue;
  turnaround.push({ business: text('Turnaround', row, 1), group: text('Turnaround', row, 2), cutoff: text('Turnaround', row, 3), day: text('Turnaround', row, 4), start: text('Turnaround', row, 5), end: text('Turnaround', row, 6), option: text('Turnaround', row, 7), selectable: text('Turnaround', row, 8) === 'Yes', days: cell('Turnaround', row, 9), readyDay: text('Turnaround', row, 10), readyAfter: text('Turnaround', row, 11), rush: text('Turnaround', row, 12) === 'Yes', action: text('Turnaround', row, 13), wording: text('Turnaround', row, 14), source: source('Turnaround', row) });
}
const kiosk = [];
for (let row = 2; row <= workbook.getWorksheet('Kiosk').rowCount; row++) {
  if (!text('Kiosk', row, 2)) continue;
  kiosk.push({ topic: text('Kiosk', row, 1), question: text('Kiosk', row, 2), answer: text('Kiosk', row, 3), appliesTo: text('Kiosk', row, 4), action: text('Kiosk', row, 5), source: source('Kiosk', row) });
}
const overview = Array.from({ length: 10 }, (_, i) => ({ topic: text('Store Guide', 44 + i, 1), answer: text('Store Guide', 44 + i, 2), source: source('Store Guide', 44 + i) }));
const data = { metadata: { file: basename(input), sha256: createHash('sha256').update(bytes).digest('hex'), sheets: workbook.worksheets.map(s => s.name), version: 1 }, stores, overview, prices, turnaround, kiosk };
await writeFile(output, JSON.stringify(data, null, 2) + '\n');
console.log(`Imported ${stores.length} stores, ${prices.length} prices, ${turnaround.length} schedules, ${kiosk.length} kiosk answers to ${output}`);
