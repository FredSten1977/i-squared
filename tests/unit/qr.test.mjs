// QR-generatoren verifiseres ved å dekode resultatet med OpenCV (hvis tilgjengelig).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const Q = require('../../src/shared/qr.js');

const hasCv = spawnSync('python3', ['-c', 'import cv2, numpy'], { encoding: 'utf8' }).status === 0;

test('QR-matrisen har riktig størrelse og finnermønstre', () => {
  const q = Q.encode('https://example.com');
  assert.equal(q.size, q.version * 4 + 17);
  // Øvre venstre finnermønster: mørk ramme 7x7 med lys ring
  assert.equal(q.modules[0][0], true);
  assert.equal(q.modules[1][1], false);
  assert.equal(q.modules[3][3], true);
});

test('SVG-utdata er gyldig og har tittel', () => {
  const svg = Q.toSvg('abc', { title: 'Test <1>' });
  assert.match(svg, /^<svg /);
  assert.match(svg, /<title>Test &lt;1&gt;<\/title>/);
});

test('for lang tekst gir feil', () => {
  assert.throws(() => Q.encode('x'.repeat(1000)), /for lang/);
});

test('QR-koder kan dekodes (OpenCV)', { skip: !hasCv && 'python3/OpenCV ikke tilgjengelig' }, () => {
  const texts = [
    'hei',
    'https://script.google.com/macros/s/AKfycbx' + 'Q'.repeat(60) + '/exec/vote/i-squared-statsbygg',
    'https://script.google.com/macros/s/AKfycbx' + 'Q'.repeat(60) + '/exec/vote/i-squared-statsbygg?poll=s1',
    'æøå ÆØÅ – lag sør'
  ];
  for (let L = 20; L <= 400; L += 38) texts.push(('https://ex.no/' + 'abcdefghijklmnopqrstuvwxyz0123456789'.repeat(20)).slice(0, L));
  const dir = mkdtempSync(join(tmpdir(), 'isq-qr-'));
  const file = join(dir, 'm.json');
  writeFileSync(file, JSON.stringify(texts.map((t) => ({ t, m: Q.encode(t).modules.map((r) => r.map(Number)) }))));
  const py = `
import json,cv2,numpy as np,sys
L=json.load(open(sys.argv[1]));d=cv2.QRCodeDetectorAruco();bad=[]
for e in L:
  m=np.pad(np.array(e['m'],dtype=np.uint8),4);img=np.kron(((1-m)*255).astype(np.uint8),np.ones((6,6),dtype=np.uint8))
  txt=d.detectAndDecode(img)[0]
  if txt!=e['t']: bad.append(e['t'][:40])
print(json.dumps(bad))`;
  const r = spawnSync('python3', ['-c', py, file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim()), []);
});
