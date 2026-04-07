// Drift detection utilities

export interface DriftReport {
    feature: string;
    baselineMean: number;
    currentMean: number;
    klDivergence: number;
    driftScore: number; // 0-1
    severity: 'none' | 'mild' | 'significant';
}

export interface DriftSummary {
    overallScore: number;
    features: DriftReport[];
    alert: boolean;
    alertType: 'none' | 'mild' | 'significant';
}

const DRIFT_THRESHOLD_MILD = 0.15;
const DRIFT_THRESHOLD_SIGNIFICANT = 0.35;

// Inject Gaussian noise + contrast shift (mimicking CIFAR-10-C severity 3)
export function injectDrift(
    data: Record<string, unknown>[],
    severity: number = 3
): Record<string, unknown>[] {
    const noiseScale = severity * 0.12;
    const contrastShift = severity * 0.08;

    return data.map((row) => {
        const newRow = { ...row };
        for (const key of Object.keys(newRow)) {
            const val = Number(newRow[key]);
            if (!isNaN(val) && val !== null) {
                // Gaussian noise
                const noise = gaussianRandom(0, noiseScale * Math.abs(val || 1));
                // Contrast (multiplicative shift)
                newRow[key] = +((val + noise) * (1 + contrastShift * (Math.random() - 0.3))).toFixed(6);
            }
        }
        return newRow;
    });
}

function gaussianRandom(mean: number, std: number): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Simplified KL divergence using histogram approximation
function histogramKL(a: number[], b: number[], bins: number = 20): number {
    if (a.length === 0 || b.length === 0) return 0;

    const allVals = [...a, ...b];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    if (max === min) return 0;

    const binWidth = (max - min) / bins;

    const histA = new Array(bins).fill(0);
    const histB = new Array(bins).fill(0);

    a.forEach((v) => {
        const idx = Math.min(bins - 1, Math.floor((v - min) / binWidth));
        histA[idx]++;
    });
    b.forEach((v) => {
        const idx = Math.min(bins - 1, Math.floor((v - min) / binWidth));
        histB[idx]++;
    });

    const pA = histA.map((c) => (c + 1e-9) / (a.length + bins * 1e-9));
    const pB = histB.map((c) => (c + 1e-9) / (b.length + bins * 1e-9));

    let kl = 0;
    for (let i = 0; i < bins; i++) {
        kl += pA[i] * Math.log(pA[i] / pB[i]);
    }
    return Math.max(0, kl);
}

export function detectDrift(
    baseline: Record<string, unknown>[],
    current: Record<string, unknown>[],
    numericColumns: string[]
): DriftSummary {
    const features: DriftReport[] = [];

    for (const col of numericColumns) {
        const baseVals = baseline.map((r) => Number(r[col])).filter((n) => !isNaN(n) && n !== null);
        const currVals = current.map((r) => Number(r[col])).filter((n) => !isNaN(n) && n !== null);

        if (baseVals.length === 0) continue;

        const baseMean = baseVals.reduce((s, v) => s + v, 0) / baseVals.length;
        const currMean = currVals.length > 0 ? currVals.reduce((s, v) => s + v, 0) / currVals.length : baseMean;

        const kl = histogramKL(baseVals, currVals);
        const normalizedKL = Math.min(1, kl / 2);
        const meanShift = Math.abs(currMean - baseMean) / (Math.abs(baseMean) + 1e-9);
        const driftScore = Math.min(1, (normalizedKL * 0.6 + meanShift * 0.4));

        const severity: 'none' | 'mild' | 'significant' =
            driftScore >= DRIFT_THRESHOLD_SIGNIFICANT
                ? 'significant'
                : driftScore >= DRIFT_THRESHOLD_MILD
                  ? 'mild'
                  : 'none';

        features.push({
            feature: col,
            baselineMean: +baseMean.toFixed(4),
            currentMean: +currMean.toFixed(4),
            klDivergence: +kl.toFixed(4),
            driftScore: +driftScore.toFixed(4),
            severity
        });
    }

    const overallScore =
        features.length > 0 ? features.reduce((s, f) => s + f.driftScore, 0) / features.length : 0;

    const maxSeverity = features.some((f) => f.severity === 'significant')
        ? 'significant'
        : features.some((f) => f.severity === 'mild')
          ? 'mild'
          : 'none';

    return {
        overallScore: +overallScore.toFixed(4),
        features,
        alert: overallScore >= DRIFT_THRESHOLD_MILD,
        alertType: maxSeverity
    };
}

// Simulate drift score time series
export function simulateDriftTimeSeries(
    length: number,
    driftStartIdx: number,
    adaptationIdx?: number
): number[] {
    const series: number[] = [];
    for (let i = 0; i < length; i++) {
        if (i < driftStartIdx) {
            series.push(+(0.02 + Math.random() * 0.04).toFixed(3));
        } else if (adaptationIdx !== undefined && i >= adaptationIdx) {
            const recovery = (i - adaptationIdx) / 15;
            series.push(+(Math.max(0.05, 0.45 - 0.35 * Math.min(1, recovery) + Math.random() * 0.03)).toFixed(3));
        } else {
            const rise = (i - driftStartIdx) / 10;
            series.push(+(Math.min(0.8, 0.05 + 0.6 * Math.min(1, rise) + Math.random() * 0.05)).toFixed(3));
        }
    }
    return series;
}
