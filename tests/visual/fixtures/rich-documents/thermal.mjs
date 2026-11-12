// Rectangular solid, uniform initial temperature, identical convection on six faces.
export const thermalDefaults = Object.freeze({ dimensionsM: Object.freeze([0.1, 0.12, 0.18]), initialC: 20, ambientC: 200, hWm2K: 20, kWmK: 45, rhoKgM3: 7800, cpJkgK: 460 });

export function thermalEigenRoot(bi, index = 0) {
  if (!Number.isFinite(bi) || bi < 0 || !Number.isInteger(index) || index < 0 || index > 511) throw new RangeError('Invalid Biot number or eigenvalue index');
  if (bi === 0) return index * Math.PI;
  let low = 0, high = Math.PI / 2;
  // Solve on the local branch to avoid evaluating tan at a large multiple of pi.
  for (let i = 0; i < 80; i++) {
    const delta = (low + high) / 2;
    if ((index * Math.PI + delta) * Math.tan(delta) > bi) high = delta;
    else low = delta;
  }
  return index * Math.PI + (low + high) / 2;
}

export function thermalCreateModel(input = {}) {
  const params = { ...thermalDefaults, ...input, dimensionsM: [...(input.dimensionsM ?? thermalDefaults.dimensionsM)] };
  const positive = ['kWmK', 'rhoKgM3', 'cpJkgK'];
  if (params.dimensionsM.length !== 3 || params.dimensionsM.some(v => !Number.isFinite(v) || v <= 0)) throw new RangeError('dimensionsM must contain three positive finite lengths');
  for (const key of positive) if (!Number.isFinite(params[key]) || params[key] <= 0) throw new RangeError(key + ' must be positive and finite');
  for (const key of ['initialC', 'ambientC']) if (!Number.isFinite(params[key]) || params[key] < -273.15) throw new RangeError(key + ' must be finite and above absolute zero');
  if (!Number.isFinite(params.hWm2K) || params.hWm2K < 0) throw new RangeError('hWm2K must be finite and nonnegative');
  const alphaM2S = params.kWmK / params.rhoKgM3 / params.cpJkgK;
  const maxTerms = input.maxTerms ?? 256;
  if (!Number.isInteger(maxTerms) || maxTerms < 2 || maxTerms > 512) throw new RangeError('maxTerms must be an integer from 2 to 512');
  const axes = params.dimensionsM.map(length => ({ halfM: length / 2, bi: params.hWm2K * (length / 2) / params.kWmK, modes: [] }));
  if (!(alphaM2S > 0) || !Number.isFinite(alphaM2S) || axes.some(a => !Number.isFinite(a.bi) || a.bi > 1e12 || (params.hWm2K > 0 && a.bi === 0) || a.halfM === 0)) throw new RangeError('Derived thermal parameters exceed numerical support');
  const mode = (axis, n) => {
    if (!axis.modes[n]) {
      const mu = thermalEigenRoot(axis.bi, n);
      axis.modes[n] = { mu, coefficient: 4 * Math.sin(mu) / (2 * mu + Math.sin(2 * mu)) };
    }
    return axis.modes[n];
  };
  function evaluate(pointM, timeS) {
    if (!Array.isArray(pointM) || pointM.length !== 3 || pointM.some((v, i) => !Number.isFinite(v) || Math.abs(v) > axes[i].halfM)) throw new RangeError('Probe must be inside the centered solid, in metres');
    if (!Number.isFinite(timeS) || timeS < 0) throw new RangeError('timeS must be finite and nonnegative');
    if (timeS === 0 || params.hWm2K === 0 || params.initialC === params.ambientC) return { temperatureC: params.initialC, converged: true, maxTailBound: 0, errorBoundC: 0, termsByAxis: [0, 0, 0] };
    const rows = axes.map((axis, i) => {
      const fo = alphaM2S * timeS / axis.halfM / axis.halfM;
      let sum = 0, tail = Infinity, count = 0;
      for (let n = 0; n < maxTerms; n++) {
        const row = mode(axis, n);
        sum += row.coefficient * Math.cos(row.mu * pointM[i] / axis.halfM) * Math.exp(-row.mu * row.mu * fo);
        count = n + 1;
        // For omitted n >= count, |A_n| < 1 and mu_n >= n*pi.
        tail = Math.exp(-count * count * Math.PI ** 2 * fo) / -Math.expm1(-(2 * count + 1) * Math.PI ** 2 * fo);
        if (tail <= 1e-10) break;
      }
      return { sum, tail, count };
    });
    const theta = rows.reduce((value, row) => value * row.sum, 1);
    const maxTailBound = rows.reduce((value, row) => value * (Math.abs(row.sum) + row.tail), 1) - rows.reduce((value, row) => value * Math.abs(row.sum), 1);
    const temperatureC = params.ambientC + (params.initialC - params.ambientC) * theta;
    const errorBoundC = Math.abs(params.initialC - params.ambientC) * maxTailBound;
    return { temperatureC, converged: rows.every(row => row.tail <= 1e-10) && Number.isFinite(temperatureC), maxTailBound, errorBoundC, termsByAxis: rows.map(row => row.count) };
  }
  Object.freeze(params.dimensionsM); Object.freeze(params);
  return { params, alphaM2S, axes: Object.freeze(axes.map(({halfM,bi}) => Object.freeze({halfM,bi}))), evaluate, temperatureAt(pointM, timeS) {
    const result = evaluate(pointM, timeS);
    if (!result.converged) throw new RangeError('Eigenseries cap reached: increase time or use a different validated solver');
    return result.temperatureC;
  }, diagnostics(timeS = 0) {
    const checks = [[0, 0, 0], axes.map(a => a.halfM)].map(point => evaluate(point, timeS));
    return { model: 'rectangular-solid-convection6faces-eigenseries', alphaM2S, bi: axes.map(a => a.bi), maxTerms, timeS, converged: checks.every(r => r.converged), checks, limitations: 'Uniform initial temperature; isotropic constant properties; identical constant convection on six faces; no radiation, sources, or phase change. Bounds and time monotonicity follow this model, not arbitrary boundary histories. Tail bounds exclude floating-point roundoff.' };
  } };
}
