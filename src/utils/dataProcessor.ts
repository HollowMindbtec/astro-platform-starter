// Data processing utilities for the Coginflow pipeline

export interface ColumnStats {
    name: string;
    type: 'numeric' | 'categorical';
    count: number;
    missing: number;
    missingPct: number;
    mean?: number;
    std?: number;
    min?: number;
    max?: number;
    median?: number;
    unique?: number;
    topValues?: string[];
}

export interface ProfileReport {
    rowCount: number;
    columnCount: number;
    columns: ColumnStats[];
    completeness: number;
}

export function profileData(data: Record<string, unknown>[]): ProfileReport {
    if (!data.length) return { rowCount: 0, columnCount: 0, columns: [], completeness: 0 };

    const keys = Object.keys(data[0]);
    const columns: ColumnStats[] = [];

    for (const key of keys) {
        const values = data.map((r) => r[key]);
        const missing = values.filter((v) => v === null || v === undefined || v === '').length;
        const valid = values.filter((v) => v !== null && v !== undefined && v !== '');
        const missingPct = (missing / values.length) * 100;

        const numericValues = valid.map((v) => Number(v)).filter((n) => !isNaN(n));
        const isNumeric = numericValues.length > valid.length * 0.7;

        if (isNumeric && numericValues.length > 0) {
            const sorted = [...numericValues].sort((a, b) => a - b);
            const mean = numericValues.reduce((s, v) => s + v, 0) / numericValues.length;
            const variance = numericValues.reduce((s, v) => s + (v - mean) ** 2, 0) / numericValues.length;
            const median = sorted[Math.floor(sorted.length / 2)];
            columns.push({
                name: key,
                type: 'numeric',
                count: valid.length,
                missing,
                missingPct,
                mean: +mean.toFixed(4),
                std: +Math.sqrt(variance).toFixed(4),
                min: sorted[0],
                max: sorted[sorted.length - 1],
                median
            });
        } else {
            const strValues = valid.map((v) => String(v));
            const freq: Record<string, number> = {};
            strValues.forEach((v) => (freq[v] = (freq[v] || 0) + 1));
            const topValues = Object.entries(freq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([v]) => v);
            columns.push({
                name: key,
                type: 'categorical',
                count: valid.length,
                missing,
                missingPct,
                unique: Object.keys(freq).length,
                topValues
            });
        }
    }

    const totalCells = data.length * keys.length;
    const missingCells = columns.reduce((s, c) => s + c.missing, 0);
    const completeness = ((totalCells - missingCells) / totalCells) * 100;

    return { rowCount: data.length, columnCount: keys.length, columns, completeness };
}

export function imputeMissingValues(data: Record<string, unknown>[], profile: ProfileReport): Record<string, unknown>[] {
    const medians: Record<string, number> = {};
    const modes: Record<string, string> = {};

    profile.columns.forEach((col) => {
        if (col.type === 'numeric' && col.median !== undefined) {
            medians[col.name] = col.median;
        } else if (col.type === 'categorical' && col.topValues?.length) {
            modes[col.name] = col.topValues[0];
        }
    });

    return data.map((row) => {
        const newRow = { ...row };
        for (const key of Object.keys(newRow)) {
            if (newRow[key] === null || newRow[key] === undefined || newRow[key] === '') {
                if (medians[key] !== undefined) {
                    newRow[key] = medians[key];
                } else if (modes[key] !== undefined) {
                    newRow[key] = modes[key];
                }
            }
        }
        return newRow;
    });
}

export function minMaxNormalize(
    data: Record<string, unknown>[],
    columns: string[]
): { data: Record<string, unknown>[]; ranges: Record<string, { min: number; max: number }> } {
    const ranges: Record<string, { min: number; max: number }> = {};

    for (const col of columns) {
        const vals = data.map((r) => Number(r[col])).filter((n) => !isNaN(n));
        if (vals.length === 0) continue;
        ranges[col] = { min: Math.min(...vals), max: Math.max(...vals) };
    }

    const normalized = data.map((row) => {
        const newRow = { ...row };
        for (const col of columns) {
            const r = ranges[col];
            if (r && r.max !== r.min) {
                const v = Number(newRow[col]);
                if (!isNaN(v)) {
                    newRow[`${col}_norm`] = +((v - r.min) / (r.max - r.min)).toFixed(6);
                }
            }
        }
        return newRow;
    });

    return { data: normalized, ranges };
}

export function detectOutliers(data: Record<string, unknown>[], column: string): number[] {
    const vals = data.map((r) => Number(r[column])).filter((n) => !isNaN(n));
    if (vals.length < 4) return [];

    const sorted = [...vals].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    const outlierIndices: number[] = [];
    data.forEach((row, idx) => {
        const v = Number(row[column]);
        if (!isNaN(v) && (v < lower || v > upper)) {
            outlierIndices.push(idx);
        }
    });

    return outlierIndices;
}

export function oneHotEncode(
    data: Record<string, unknown>[],
    column: string
): Record<string, unknown>[] {
    const vals = [...new Set(data.map((r) => String(r[column])).filter((v) => v && v !== 'null'))];
    return data.map((row) => {
        const newRow = { ...row };
        vals.forEach((val) => {
            newRow[`${column}_${val.replace(/\s+/g, '_')}`] = row[column] === val ? 1 : 0;
        });
        return newRow;
    });
}

export function engineerFeatures(data: Record<string, unknown>[]): Record<string, unknown>[] {
    return data.map((row) => {
        const newRow = { ...row };
        const mass = Number(row.pl_bmasse);
        const radius = Number(row.pl_rade);
        const period = Number(row.pl_orbper);
        const sma = Number(row.pl_orbsmax);
        const stTeff = Number(row.st_teff);

        // Planet density (Earth units)
        if (!isNaN(mass) && !isNaN(radius) && radius > 0) {
            newRow.planet_density = +(mass / Math.pow(radius, 3)).toFixed(4);
        }

        // Simple habitability score (0-1)
        if (!isNaN(period) && !isNaN(stTeff) && !isNaN(radius)) {
            const tempScore = stTeff > 3700 && stTeff < 7000 ? 1 : 0;
            const periodScore = period > 200 && period < 500 ? 1 : period > 100 ? 0.5 : 0;
            const sizeScore = radius > 0.5 && radius < 2.5 ? 1 : radius < 4 ? 0.5 : 0;
            newRow.habitability_score = +((tempScore + periodScore + sizeScore) / 3).toFixed(3);
        }

        // Orbital velocity (AU/day, Kepler's 3rd law approximation)
        if (!isNaN(period) && !isNaN(sma) && period > 0) {
            const circumference = 2 * Math.PI * sma;
            newRow.orbital_velocity = +(circumference / period).toFixed(6);
        }

        return newRow;
    });
}

export function validateData(
    data: Record<string, unknown>[],
    profile: ProfileReport
): { checks: Array<{ name: string; pass: boolean; detail: string }> } {
    const checks = [];

    // Schema consistency
    const keys = Object.keys(data[0] || {});
    checks.push({
        name: 'Schema Consistency',
        pass: data.every((r) => Object.keys(r).length === keys.length),
        detail: `All ${data.length} rows have ${keys.length} columns`
    });

    // Missing values threshold
    const maxMissing = Math.max(...profile.columns.map((c) => c.missingPct));
    checks.push({
        name: 'Missing Values Threshold',
        pass: maxMissing < 50,
        detail: `Max missing: ${maxMissing.toFixed(1)}% (threshold: 50%)`
    });

    // Numeric ranges (pl_orbper > 0)
    const orbPer = data.map((r) => Number(r.pl_orbper)).filter((n) => !isNaN(n));
    const negPeriods = orbPer.filter((v) => v <= 0).length;
    checks.push({
        name: 'Orbital Period > 0',
        pass: negPeriods === 0,
        detail: negPeriods === 0 ? 'All orbital periods positive' : `${negPeriods} negative values found`
    });

    // Completeness
    checks.push({
        name: 'Minimum Completeness',
        pass: profile.completeness > 50,
        detail: `Dataset completeness: ${profile.completeness.toFixed(1)}%`
    });

    // Row count
    checks.push({
        name: 'Minimum Row Count',
        pass: data.length >= 10,
        detail: `${data.length} rows loaded`
    });

    // Distribution sanity: temperatures in stellar range
    const temps = data.map((r) => Number(r.st_teff)).filter((n) => !isNaN(n) && n > 0);
    const validTemps = temps.filter((t) => t > 2000 && t < 50000).length;
    checks.push({
        name: 'Stellar Temperature Range',
        pass: temps.length === 0 || validTemps / temps.length > 0.8,
        detail:
            temps.length > 0
                ? `${((validTemps / temps.length) * 100).toFixed(1)}% in valid range (2000-50000K)`
                : 'No temperature data'
    });

    return { checks };
}
