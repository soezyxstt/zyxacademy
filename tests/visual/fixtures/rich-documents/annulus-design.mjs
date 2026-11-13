import { annulusParams } from './flow.mjs';

export const annulusDesignDefaults = Object.freeze({ innerDiameterM: .05, outerDiameterM: .1, massFlowKgS: .1, cpJkgK: 3900, hWm2K: 140, inletC: 25, wallC: 85, targetOutletC: 55, probeFraction: .5 });

export function annulusDesignParams(input = {}) {
  const p = { ...annulusDesignDefaults, ...input };
  annulusParams({ ...p, lengthM: 1, boundary: 'temperature' });
  if (!Number.isFinite(p.targetOutletC) || p.inletC <= -273.15 || p.wallC <= -273.15 || p.targetOutletC <= -273.15) throw new RangeError('Suhu harus di atas nol absolut');
  if (!(p.inletC < p.targetOutletC && p.targetOutletC < p.wallC)) throw new RangeError('Suhu target harus di antara suhu masuk dan suhu dinding');
  return p;
}

export function annulusDesignModel(input = {}) {
  const p = annulusDesignParams(input);
  const capacityWK = p.massFlowKgS * p.cpJkgK;
  const perimeterM = Math.PI * p.innerDiameterM;
  const lengthM = capacityWK / (p.hWm2K * perimeterM) * Math.log((p.wallC - p.inletC) / (p.wallC - p.targetOutletC));
  if (!Number.isFinite(lengthM) || lengthM <= 0) throw new RangeError('Panjang hasil tidak dapat dihitung');
  const at = fraction => {
    const xM = fraction * lengthM;
    const bulkC = p.inletC + (p.wallC - p.inletC) * -Math.expm1(-p.hWm2K * perimeterM * xM / capacityWK);
    return { fraction, xM, bulkC, heatFluxWm2: p.hWm2K * (p.wallC - bulkC) };
  };
  const span = p.wallC - p.inletC, remaining = p.wallC - p.targetOutletC;
  const logSpan = Math.log(span / remaining);
  const boundaries = Array.from({ length: 321 }, (_, i) => i === 320 ? 1 : Math.log(span / (span * (1 - i / 320) + remaining * i / 320)) / logSpan);
  const colorStops = boundaries.map(fraction => ({ fraction, bulkC: at(fraction).bulkC }));
  return { colorStops, lengthM, heatW: capacityWK * (p.targetOutletC - p.inletC), perimeterM, capacityWK, flowAreaM2: Math.PI / 4 * (p.outerDiameterM ** 2 - p.innerDiameterM ** 2), probe: at(p.probeFraction), profile: Array.from({ length: 41 }, (_, i) => at(i / 40)), graphProfile: Array.from({ length: 41 }, (_, i) => at(i / 40 * Math.min(1, 120 / lengthM))) };
}
