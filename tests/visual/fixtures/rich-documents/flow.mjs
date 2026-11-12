// Flat-plate estimates and a one-dimensional annulus energy balance, SI units.
export const boundaryDefaults = Object.freeze({ lengthM: .8, reynoldsL: 200000, prandtl: .8, conductivityWmK: .028, probeFraction: .5 });
export const annulusDefaults = Object.freeze({ innerDiameterM: .04, outerDiameterM: .09, lengthM: 8, massFlowKgS: .08, cpJkgK: 4000, hWm2K: 100, inletC: 20, wallC: 80, heatFluxWm2: 1200, boundary: 'temperature', probeFraction: .5 });

function flowRange(p, key, low, high) {
  if (!Number.isFinite(p[key]) || p[key] < low || p[key] > high) throw new RangeError(`${key} must be within ${low} and ${high}`);
}
export function boundaryParams(input = {}) {
  const p = { ...boundaryDefaults, ...input };
  flowRange(p, 'lengthM', .05, 10); flowRange(p, 'reynoldsL', 10000, 1000000);
  flowRange(p, 'prandtl', .1, 100); flowRange(p, 'conductivityWmK', .005, 2); flowRange(p, 'probeFraction', 0, 1);
  return p;
}
export function boundaryAt(input, xM) {
  const p = boundaryParams(input);
  flowRange({ xM }, 'xM', 0, p.lengthM);
  const reynoldsX = p.reynoldsL * xM / p.lengthM;
  const deltaM = xM === 0 ? 0 : 5 * xM / Math.sqrt(reynoldsX);
  const ratio = p.prandtl ** (-1 / 3);
  const nusseltX = .332 * Math.sqrt(reynoldsX) * p.prandtl ** (1 / 3);
  return { xM, reynoldsX, deltaM, thermalDeltaM: deltaM * ratio, ratio, nusseltX, localHWm2K: xM === 0 ? null : nusseltX * p.conductivityWmK / xM,
    averageHWm2K: .664 * Math.sqrt(p.reynoldsL) * p.prandtl ** (1 / 3) * p.conductivityWmK / p.lengthM,
    valid: p.reynoldsL <= 500000 && p.prandtl >= .6 && p.prandtl <= 50,
    limitations: 'Pelat datar isotermal, aliran laminar, sifat konstan, pemanasan dari tepi depan. ReL <= 500000 dan 0.6 <= Pr <= 50. Rasio ketebalan adalah perkiraan. Tidak berlaku tepat di tepi depan; bukan solusi CFD atau profil kecepatan.' };
}
export function annulusParams(input = {}) {
  const p = { ...annulusDefaults, ...input };
  flowRange(p, 'innerDiameterM', .01, .2); flowRange(p, 'outerDiameterM', .02, .4);
  if (p.outerDiameterM <= p.innerDiameterM) throw new RangeError('Diameter luar harus lebih besar dari diameter dalam');
  flowRange(p, 'lengthM', .1, 50); flowRange(p, 'massFlowKgS', .005, 2); flowRange(p, 'cpJkgK', 100, 10000);
  flowRange(p, 'hWm2K', 1, 2000); flowRange(p, 'inletC', -100, 500); flowRange(p, 'wallC', -100, 500);
  flowRange(p, 'heatFluxWm2', -20000, 20000); flowRange(p, 'probeFraction', 0, 1);
  if (!['temperature', 'flux'].includes(p.boundary)) throw new RangeError('boundary must be temperature or flux');
  return p;
}
export function annulusAt(input, xM) {
  const p = annulusParams(input); flowRange({ xM }, 'xM', 0, p.lengthM);
  const heatedPerimeterM = Math.PI * p.innerDiameterM, capacityWK = p.massFlowKgS * p.cpJkgK;
  const ntu = p.hWm2K * heatedPerimeterM * xM / capacityWK;
  const bulkC = p.boundary === 'temperature' ? p.inletC + (p.wallC - p.inletC) * -Math.expm1(-ntu) : p.inletC + p.heatFluxWm2 * heatedPerimeterM * xM / capacityWK;
  const wallC = p.boundary === 'temperature' ? p.wallC : bulkC + p.heatFluxWm2 / p.hWm2K;
  return { xM, bulkC, wallC, physicalTemperatureValid: bulkC >= -273.15 && wallC >= -273.15, heatFluxWm2: p.boundary === 'temperature' ? p.hWm2K * (p.wallC - bulkC) : p.heatFluxWm2, heatedPerimeterM, capacityWK, ntu };
}
export function annulusBalance(input) {
  const p = annulusParams(input), outlet = annulusAt(p, p.lengthM);
  const fluidHeatW = outlet.capacityWK * (outlet.bulkC - p.inletC);
  const wallHeatW = p.boundary === 'temperature' ? outlet.capacityWK * (p.wallC - p.inletC) * -Math.expm1(-outlet.ntu) : p.heatFluxWm2 * outlet.heatedPerimeterM * p.lengthM;
  return { ...outlet, fluidHeatW, wallHeatW, residualW: fluidHeatW - wallHeatW, flowAreaM2: Math.PI / 4 * (p.outerDiameterM ** 2 - p.innerDiameterM ** 2), hydraulicDiameterM: p.outerDiameterM - p.innerDiameterM,
    physicalTemperatureValid: outlet.physicalTemperatureValid && annulusAt(p, 0).physicalTemperatureValid,
    limitations: 'Annulus konsentris, dinding dalam dipanaskan, dinding luar adiabatik. Neraca energi tunak 1D, cp dan h ditetapkan konstan. Abaikan konduksi aksial, efek masuk, radiasi dan perubahan fase. h bukan korelasi annulus. Suhu bulk tidak menentukan medan suhu radial.' };
}
