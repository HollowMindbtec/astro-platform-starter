// NASA Exoplanet Archive TAP API utilities

export interface ExoplanetRecord {
    pl_name: string;
    hostname: string;
    sy_snum: number;
    sy_pnum: number;
    discoverymethod: string;
    disc_year: number;
    pl_orbper: number | null;
    pl_rade: number | null;
    pl_bmasse: number | null;
    pl_orbsmax: number | null;
    pl_orbeccen: number | null;
    st_teff: number | null;
    st_rad: number | null;
    st_mass: number | null;
    st_met: number | null;
    st_logg: number | null;
    [key: string]: string | number | null;
}

const TAP_URL =
    'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=SELECT+pl_name,hostname,sy_snum,sy_pnum,discoverymethod,disc_year,pl_orbper,pl_rade,pl_bmasse,pl_orbsmax,pl_orbeccen,st_teff,st_rad,st_mass,st_met,st_logg+FROM+ps+WHERE+default_flag=1+AND+ROWNUM%3C%3D500&format=csv';

function parseCSV(csvText: string): ExoplanetRecord[] {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

    const records: ExoplanetRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Simple CSV parse (handles quoted fields)
        const values = parseCSVLine(line);
        if (values.length !== headers.length) continue;

        const record: Record<string, string | number | null> = {};
        headers.forEach((header, idx) => {
            const val = values[idx]?.trim().replace(/^"|"$/g, '') ?? '';
            if (val === '' || val === 'NULL' || val === 'null' || val === 'NA') {
                record[header] = null;
            } else {
                const num = Number(val);
                record[header] = isNaN(num) ? val : num;
            }
        });
        records.push(record as ExoplanetRecord);
    }
    return records;
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

export async function fetchNASAData(): Promise<{ data: ExoplanetRecord[]; source: 'api' | 'fallback' }> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(TAP_URL, { signal: controller.signal });
        clearTimeout(timeout);

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const data = parseCSV(text);
        if (data.length < 10) throw new Error('Insufficient data');
        return { data, source: 'api' };
    } catch {
        // Fallback to static data
        try {
            const fallback = await import('../data/nasa-exoplanets.json');
            return { data: fallback.default as ExoplanetRecord[], source: 'fallback' };
        } catch {
            return { data: generateSyntheticData(), source: 'fallback' };
        }
    }
}

function generateSyntheticData(): ExoplanetRecord[] {
    const methods = ['Transit', 'Radial Velocity', 'Direct Imaging', 'Microlensing', 'Astrometry'];
    const records: ExoplanetRecord[] = [];
    const baseNames = ['Kepler', 'TESS', 'HAT', 'WASP', 'GJ', 'HD', 'K2', 'TrES', 'CoRoT'];

    for (let i = 0; i < 100; i++) {
        const base = baseNames[i % baseNames.length];
        records.push({
            pl_name: `${base}-${100 + i}b`,
            hostname: `${base}-${100 + i}`,
            sy_snum: 1,
            sy_pnum: Math.floor(Math.random() * 4) + 1,
            discoverymethod: methods[i % methods.length],
            disc_year: 2009 + Math.floor(i / 7),
            pl_orbper: 0.5 + Math.random() * 400,
            pl_rade: 0.3 + Math.random() * 20,
            pl_bmasse: 0.1 + Math.random() * 3000,
            pl_orbsmax: 0.01 + Math.random() * 5,
            pl_orbeccen: Math.random() * 0.9,
            st_teff: 3000 + Math.random() * 5000,
            st_rad: 0.1 + Math.random() * 3,
            st_mass: 0.1 + Math.random() * 2,
            st_met: -1 + Math.random() * 2,
            st_logg: 1 + Math.random() * 4
        });
    }
    return records;
}
