import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { rotorResponse } from './models.js';

const mechanics = readFileSync(new URL('./mechanics.js', import.meta.url), 'utf8');
const samplingSource = readFileSync(new URL('./sampling.js', import.meta.url), 'utf8');
const helpers = samplingSource.slice(samplingSource.indexOf('function means('), samplingSource.indexOf('main.dataset.samplingFixture='));
const { means, histogram } = runInNewContext(`${helpers}; ({ means, histogram })`);
const springSource = mechanics.slice(mechanics.indexOf('const spring='), mechanics.indexOf('const mathLabel='));
const spring = runInNewContext(`${springSource}; spring`);
const forceArrowSource = mechanics.slice(mechanics.indexOf('const forceArrow='), mechanics.indexOf('const mathLabel='));
const forceArrow = runInNewContext(`${forceArrowSource}; forceArrow`);
assert.match(mechanics, /force=v\.F\*Math\.sin\(v\.psi\)/);
assert.match(mechanics, /\$\{forceArrow\(x,y,force\)\}/);
assert.match(mechanics, /data-force-scale d="M32 22V28 M32 25H62 M62 22V28"/);
assert.match(mechanics, /data-damper-cylinder d="M183\.5 140V195H201\.5V140 M192\.5 195V215"/);
const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

const J = 500 * 2 ** 2 + 60 * 2 ** 2 / 3;
const K = 80000 * 2 ** 2 / 4;
const C = 2 * .08 * Math.sqrt(K * J);
close(J, 2080, 1e-9); close(K, 80000, 1e-9); close(C, 2063.94, .01);
assert.match(mechanics, /angle=v\.theta\*40/);
for (let step = 40; step <= 300; step++) {
  const r = step * .005, omega = r * Math.sqrt(K / J);
  const amplitude = (10 * .04 * omega ** 2 * 2) / Math.hypot(K - J * omega ** 2, C * omega);
  const response = rotorResponse(r, .5);
  close(response.amp, amplitude, 1e-12);
  for (const theta of [-amplitude, amplitude, rotorResponse(r, 0).theta, response.theta]) {
    const angle = theta * 40, x = 90 + 410 * Math.cos(angle), y = 110 - 410 * Math.sin(angle);
    assert.ok(x - 34 >= 0 && x + 34 <= 620 && y - 45 >= 0 && y + 34 < 215, `rotor envelope r=${r}, theta=${theta}`);
    const maxForce = 10 * .04 * omega ** 2, arrowLength = 30 * maxForce / 25, arrowHalfWidth = 5 * maxForce / 25;
    assert.ok(x + 46 + arrowHalfWidth <= 620 && y - arrowLength >= 0 && y + arrowLength <= 270, `force arrow envelope r=${r}, theta=${theta}`);
    const sx = 90 + (x - 90) / 2, sy = 110 + (y - 110) / 2, dy = 110 + (y - 110) / 4;
    const points = spring(sx, sy).match(/-?\d+(?:\.\d+)?/g).map(Number);
    close(points[0], sx, 1e-9); close(points[1], sy, 1e-9);
    close(points.at(-2), 295, 1e-9); close(points.at(-1), 215, 1e-9);
    for (let i = 1; i <= 7; i++) {
      close(points[2*i+1], sy + (215-sy)*i/8, 1e-9);
      assert.ok(points[2*i+1] > sy && points[2*i+1] < 215);
    }
    assert.ok(dy+45 > 140 && dy+45 < 195, `piston inside cylinder r=${r}`);
  }
  for (const time of [0, .5, 1.25]) {
    const v = rotorResponse(r, time), force = 10 * .04 * omega ** 2 * Math.sin(omega * time);
    close(J * v.acc + C * v.v + K * v.theta - 2 * force, 0, 1e-8);
    const c = C * 16 / 2 ** 2, fk = 80000 * (2 / 2) * v.theta, fc = c * (2 / 4) * v.v;
    close(2 * force - (2 / 2) * fk - (2 / 4) * fc - 500 * 2 ** 2 * v.acc - 60 * (2 / 2) ** 2 * v.acc - (60 * 2 ** 2 / 12) * v.acc, 0, 1e-8);
  }
}
close(rotorResponse(.8, 0).amp * 1000, .644, .0005);
close(rotorResponse(1, 0).amp * 1000, 2.404, .0005);
for (const [time, expected] of [[0, 0], [.25, 15.38], [.75, -15.36]]) {
  const response = rotorResponse(1, time);
  const force = response.F * Math.sin(response.psi);
  close(force, expected, .01);
  const arrow = forceArrow(500, 110, force);
  const [, x, y, sx, sy] = arrow.match(/translate\(([^ ]+) ([^)]+)\) scale\(([^ ]+) ([^)]+)\)/).map(Number);
  close(x, 546, 1e-9); close(y, 110, 1e-9);
  close(sx, Math.abs(force) / 25, 1e-12); close(sy, force / 25, 1e-12);
  assert.match(arrow, new RegExp(`visibility="${time === 0 ? 'hidden' : 'visible'}"`));
  assert.equal(Math.sign(-30 * sy), -Math.sign(force));
}
const smallPositive = forceArrow(500, 110, .1), smallNegative = forceArrow(500, 110, -.1);
assert.match(smallPositive, /scale\(0\.004 0\.004\)/);
assert.match(smallNegative, /scale\(0\.004 -0\.004\)/);
const resonanceOmega = Math.sqrt(K / J);
for (const [time, expectedY] of [[0, 149.362], [.5, 70.670], [Math.PI / resonanceOmega, 70.638]]) {
  const y = 110 - 410 * Math.sin(40 * rotorResponse(1, time).theta);
  close(y, expectedY, .001);
}

const expectedTails = new Map([[1, 46], [2, 28], [4, 9], [16, 0], [64, 0]]);
for (let n = 1; n <= 64; n++) {
  let state = 4271, lower = 0, upper = 0, within = 0;
  const independentBins = Array(36).fill(0), se = 380 / Math.sqrt(n);
  for (let sample = 0; sample < 600; sample++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      sum -= Math.log((state + .5) / 4294967296);
    }
    const value = 2070 + 380 * sum / n;
    if (Math.abs(value - 2450) <= se) within++;
    if (value < 1900) lower++; else if (value > 3000) upper++; else independentBins[Math.min(35, Math.floor((value - 1900) / 1100 * 36))]++;
  }
  const result = histogram(means(n));
  assert.equal(result.below, lower); assert.equal(result.above, upper);
  assert.deepEqual(Array.from(result.bins), independentBins);
  assert.equal(means(n).filter(value => Math.abs(value - 2450) <= se).length, within);
  if (n === 1) assert.equal(within, 523);
  if (n === 64) assert.equal(within, 409);
  assert.equal(result.bins.reduce((a, b) => a + b, 0) + result.below + result.above, 600);
  if (expectedTails.has(n)) assert.equal(upper, expectedTails.get(n));
}
const boundary = histogram([1899, 1900, 3000, 3001]);
assert.equal(boundary.below, 1); assert.equal(boundary.above, 1);
assert.equal(boundary.bins.reduce((a, b) => a + b, 0), 2);
console.log('Mechanics independent balance, amplitude, force arrow and fixed-frame extrema; sampling 1..64 bins, observed coverage and tail conservation: passed');
