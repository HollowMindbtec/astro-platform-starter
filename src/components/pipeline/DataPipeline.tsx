'use client';
import React, { useState, useCallback } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
    profileData,
    imputeMissingValues,
    minMaxNormalize,
    detectOutliers,
    oneHotEncode,
    engineerFeatures,
    validateData,
    type ProfileReport,
    type ColumnStats
} from '../../utils/dataProcessor';
import { fetchNASAData, type ExoplanetRecord } from '../../utils/nasaData';
import { saveState, addLog, loadState } from '../../utils/pipelineStore';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type StageStatus = 'idle' | 'running' | 'complete' | 'error';

const NUMERIC_COLS = ['pl_orbper', 'pl_rade', 'pl_bmasse', 'pl_orbsmax', 'pl_orbeccen', 'st_teff', 'st_rad', 'st_mass'];

const CHART_OPTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {} } },
    scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } },
        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } }
    }
};

function StatusBadge({ status }: { status: StageStatus }) {
    const map: Record<StageStatus, string> = { idle: 'status-idle', running: 'status-running', complete: 'status-complete', error: 'status-error' };
    const dot: Record<StageStatus, string> = { idle: 'status-dot-idle', running: 'status-dot-running', complete: 'status-dot-complete', error: 'status-dot-error' };
    return <span className={map[status]}><span className={dot[status]} />{status}</span>;
}

function DagNode({ label, icon, status, step }: { label: string; icon: string; status: StageStatus; step: number }) {
    const border = { idle: 'border-slate-700', running: 'border-yellow-500', complete: 'border-emerald-500', error: 'border-red-500' }[status];
    const bg = { idle: 'bg-slate-800', running: 'bg-yellow-900/20', complete: 'bg-emerald-900/20', error: 'bg-red-900/20' }[status];
    return (
        <div className={`flex flex-col items-center gap-1 rounded-lg border ${border} ${bg} px-3 py-2 min-w-[90px] text-center`}>
            <div className="text-lg">{icon}</div>
            <div className="text-xs font-medium text-white">{label}</div>
            <StatusBadge status={status} />
            <div className="text-xs text-slate-500">Stage {step}</div>
        </div>
    );
}

interface CustomDataInput {
    pl_name: string; hostname: string; discoverymethod: string; disc_year: string;
    pl_orbper: string; pl_rade: string; pl_bmasse: string; pl_orbsmax: string;
    pl_orbeccen: string; st_teff: string; st_rad: string; st_mass: string; st_met: string; st_logg: string;
}

const EMPTY_CUSTOM: CustomDataInput = {
    pl_name: '', hostname: '', discoverymethod: 'Transit', disc_year: '2020',
    pl_orbper: '', pl_rade: '', pl_bmasse: '', pl_orbsmax: '',
    pl_orbeccen: '', st_teff: '', st_rad: '', st_mass: '', st_met: '', st_logg: ''
};

export default function DataPipeline() {
    const [stageStatuses, setStageStatuses] = useState<Record<string, StageStatus>>({
        ingestion: 'idle', profiling: 'idle', preprocessing: 'idle', validation: 'idle'
    });
    const [rawData, setRawData] = useState<ExoplanetRecord[] | null>(null);
    const [dataSource, setDataSource] = useState<'api' | 'fallback' | null>(null);
    const [profile, setProfile] = useState<ProfileReport | null>(null);
    const [processedData, setProcessedData] = useState<Record<string, unknown>[] | null>(null);
    const [validationResults, setValidationResults] = useState<{ checks: Array<{ name: string; pass: boolean; detail: string }> } | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customInput, setCustomInput] = useState<CustomDataInput>(EMPTY_CUSTOM);
    const [customCSV, setCustomCSV] = useState('');
    const [statusMsg, setStatusMsg] = useState('');
    const [outlierCounts, setOutlierCounts] = useState<Record<string, number>>({});
    const [imputeCounts, setImputeCounts] = useState<{ before: number; after: number } | null>(null);

    const log = useCallback((msg: string, stage?: string) => {
        const ts = new Date().toISOString().substring(11, 19);
        const entry = `[${ts}]${stage ? ` [${stage.toUpperCase()}]` : ''} ${msg}`;
        setLogs((prev) => [...prev.slice(-99), entry]);
        addLog(msg, stage);
    }, []);

    const setStage = (stage: string, status: StageStatus) =>
        setStageStatuses((prev) => ({ ...prev, [stage]: status }));

    // Stage 1: Fetch NASA Data
    async function fetchData() {
        setStage('ingestion', 'running');
        setStatusMsg('Fetching data from NASA TAP API...');
        log('Initiating NASA Exoplanet Archive TAP query', 'ingestion');
        try {
            const { data, source } = await fetchNASAData();
            setRawData(data);
            setDataSource(source);
            setStage('ingestion', 'complete');
            setStatusMsg(`Loaded ${data.length} records (source: ${source})`);
            log(`Successfully loaded ${data.length} exoplanet records (source: ${source})`, 'ingestion');
            saveState({ rawDataCount: data.length, rawDataSource: source, stageStatuses: { ...stageStatuses, ingestion: 'complete' } });
        } catch (e) {
            setStage('ingestion', 'error');
            setStatusMsg('Error fetching data');
            log(`Fetch error: ${e}`, 'ingestion');
        }
    }

    // Inject custom data
    function injectCustomData() {
        if (customCSV.trim()) {
            try {
                const lines = customCSV.trim().split('\n');
                const headers = lines[0].split(',').map((h) => h.trim());
                const records: ExoplanetRecord[] = lines.slice(1).map((line) => {
                    const vals = line.split(',');
                    const rec: Record<string, unknown> = {};
                    headers.forEach((h, i) => {
                        const v = vals[i]?.trim();
                        rec[h] = v && !isNaN(Number(v)) ? Number(v) : v ?? null;
                    });
                    return rec as ExoplanetRecord;
                });
                const combined = [...(rawData ?? []), ...records];
                setRawData(combined);
                setStage('ingestion', 'complete');
                log(`Injected ${records.length} custom CSV records. Total: ${combined.length}`, 'ingestion');
                saveState({ rawDataCount: combined.length });
                setCustomCSV('');
                setShowCustomForm(false);
            } catch {
                log('Failed to parse custom CSV', 'ingestion');
            }
        } else {
            // Form mode
            const rec: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(customInput)) {
                rec[k] = v && !isNaN(Number(v)) ? Number(v) : v || null;
            }
            rec.sy_snum = 1;
            rec.sy_pnum = 1;
            const combined = [...(rawData ?? []), rec as ExoplanetRecord];
            setRawData(combined);
            setStage('ingestion', 'complete');
            log(`Injected 1 custom record: ${customInput.pl_name}. Total: ${combined.length}`, 'ingestion');
            saveState({ rawDataCount: combined.length });
            setCustomInput(EMPTY_CUSTOM);
            setShowCustomForm(false);
        }
    }

    // Stage 2: Profile Data
    function profileDataStage() {
        if (!rawData) return;
        setStage('profiling', 'running');
        log('Starting automated data profiling', 'profiling');
        setTimeout(() => {
            try {
                const prof = profileData(rawData as Record<string, unknown>[]);
                setProfile(prof);
                setStage('profiling', 'complete');
                log(`Profiled ${prof.rowCount} rows × ${prof.columnCount} cols. Completeness: ${prof.completeness.toFixed(1)}%`, 'profiling');
                saveState({ profiledAt: Date.now(), stageStatuses: { ...stageStatuses, profiling: 'complete' } });
            } catch (e) {
                setStage('profiling', 'error');
                log(`Profiling error: ${e}`, 'profiling');
            }
        }, 600);
    }

    // Stage 3: Preprocess
    function preprocessData() {
        if (!rawData || !profile) return;
        setStage('preprocessing', 'running');
        log('Starting preprocessing pipeline', 'preprocessing');
        setTimeout(() => {
            try {
                let data = rawData as Record<string, unknown>[];
                // Count missing before
                const missBefore = data.reduce((s, r) => s + Object.values(r).filter((v) => v === null || v === undefined || v === '').length, 0);

                // 1. Impute
                data = imputeMissingValues(data, profile);
                const missAfter = data.reduce((s, r) => s + Object.values(r).filter((v) => v === null || v === undefined || v === '').length, 0);
                setImputeCounts({ before: missBefore, after: missAfter });
                log(`Imputation: ${missBefore} → ${missAfter} missing values`, 'preprocessing');

                // 2. Normalize
                const { data: normData } = minMaxNormalize(data, NUMERIC_COLS);
                data = normData;
                log(`Normalized ${NUMERIC_COLS.length} numeric columns (min-max)`, 'preprocessing');

                // 3. Outliers
                const outliers: Record<string, number> = {};
                for (const col of ['pl_orbper', 'pl_rade', 'pl_bmasse']) {
                    outliers[col] = detectOutliers(data, col).length;
                }
                setOutlierCounts(outliers);
                const totalOutliers = Object.values(outliers).reduce((s, v) => s + v, 0);
                log(`Outlier detection: ${totalOutliers} flagged across key columns`, 'preprocessing');

                // 4. One-hot encode discovery method
                data = oneHotEncode(data, 'discoverymethod');
                log('One-hot encoded: discoverymethod', 'preprocessing');

                // 5. Feature engineering
                data = engineerFeatures(data);
                log('Feature engineering: planet_density, habitability_score, orbital_velocity', 'preprocessing');

                setProcessedData(data);
                setStage('preprocessing', 'complete');
                log(`Preprocessing complete. ${data.length} rows, ${Object.keys(data[0] ?? {}).length} features`, 'preprocessing');
                saveState({ processedAt: Date.now(), stageStatuses: { ...stageStatuses, preprocessing: 'complete' } });
            } catch (e) {
                setStage('preprocessing', 'error');
                log(`Preprocessing error: ${e}`, 'preprocessing');
            }
        }, 800);
    }

    // Stage 4: Validate
    function validateDataStage() {
        if (!processedData || !profile) return;
        setStage('validation', 'running');
        log('Running data validation checks', 'validation');
        setTimeout(() => {
            try {
                const results = validateData(processedData, profile);
                setValidationResults(results);
                const passed = results.checks.filter((c) => c.pass).length;
                setStage('validation', 'complete');
                log(`Validation: ${passed}/${results.checks.length} checks passed`, 'validation');
                saveState({ stageStatuses: { ...stageStatuses, validation: 'complete' } });
            } catch (e) {
                setStage('validation', 'error');
                log(`Validation error: ${e}`, 'validation');
            }
        }, 500);
    }

    // Chart data for histogram
    function getHistogramData(col: ColumnStats) {
        if (col.type !== 'numeric' || !rawData) return null;
        const vals = (rawData as Record<string, unknown>[]).map((r) => Number(r[col.name])).filter((n) => !isNaN(n) && n > 0);
        if (vals.length === 0) return null;

        const min = Math.min(...vals), max = Math.max(...vals);
        const binCount = 12;
        const binW = (max - min) / binCount;
        const bins = Array.from({ length: binCount }, (_, i) => ({
            label: `${(min + i * binW).toFixed(1)}`,
            count: 0
        }));
        vals.forEach((v) => {
            const idx = Math.min(binCount - 1, Math.floor((v - min) / binW));
            bins[idx].count++;
        });
        return {
            labels: bins.map((b) => b.label),
            datasets: [{
                data: bins.map((b) => b.count),
                backgroundColor: 'rgba(0,212,255,0.5)',
                borderColor: 'rgba(0,212,255,0.8)',
                borderWidth: 1
            }]
        };
    }

    const previewRows = rawData?.slice(0, 20) ?? [];
    const previewCols = rawData ? Object.keys(rawData[0] ?? {}).slice(0, 8) : [];
    const processedCols = processedData ? Object.keys(processedData[0] ?? {}).slice(0, 10) : [];
    const newCols = ['planet_density', 'habitability_score', 'orbital_velocity'];

    return (
        <div className="space-y-8">
            {/* Page header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Coginflow Data Pipeline</h1>
                <p className="text-slate-400 mt-1">Adaptive data ingestion, profiling, preprocessing, and validation pipeline</p>
            </div>

            {/* DAG Visualization */}
            <div className="card">
                <div className="section-label">Pipeline DAG</div>
                <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
                    {[
                        { label: 'Ingestion', icon: '🔌', stage: 'ingestion', step: 1 },
                        { label: 'Profiling', icon: '📊', stage: 'profiling', step: 2 },
                        { label: 'Preprocess', icon: '🔧', stage: 'preprocessing', step: 3 },
                        { label: 'Validation', icon: '✅', stage: 'validation', step: 4 }
                    ].map((node, i, arr) => (
                        <React.Fragment key={node.stage}>
                            <DagNode
                                label={node.label}
                                icon={node.icon}
                                status={stageStatuses[node.stage] as StageStatus}
                                step={node.step}
                            />
                            {i < arr.length - 1 && <div className="text-slate-600 font-bold">→</div>}
                        </React.Fragment>
                    ))}
                </div>
                {statusMsg && (
                    <div className="mt-3 text-xs text-cyan-400 bg-cyan-500/10 rounded px-3 py-2">
                        ℹ️ {statusMsg}
                    </div>
                )}
            </div>

            {/* Stage 1: Data Ingestion */}
            <div className="card space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <div className="section-label">Stage 1: Data Ingestion</div>
                        <h2 className="text-lg font-semibold text-white">NASA Exoplanet Archive</h2>
                    </div>
                    <StatusBadge status={stageStatuses.ingestion as StageStatus} />
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={fetchData}
                        disabled={stageStatuses.ingestion === 'running'}
                        className="btn-primary"
                    >
                        {stageStatuses.ingestion === 'running' ? '⏳ Fetching...' : '🔌 Fetch NASA Data'}
                    </button>
                    <button onClick={() => setShowCustomForm(!showCustomForm)} className="btn-neutral">
                        💉 Inject Custom Data
                    </button>
                </div>

                {showCustomForm && (
                    <div className="card bg-slate-900/60 space-y-4">
                        <div className="section-label">Custom Data Injection</div>
                        <div className="space-y-2">
                            <label className="text-xs text-slate-400">Paste CSV data (with header row):</label>
                            <textarea
                                value={customCSV}
                                onChange={(e) => setCustomCSV(e.target.value)}
                                className="w-full h-24 bg-slate-800 border border-slate-700 rounded p-2 text-xs text-slate-300 font-mono resize-y"
                                placeholder="pl_name,hostname,discoverymethod,pl_orbper,pl_rade,pl_bmasse&#10;MyPlanet-b,MyHost,Transit,365.0,1.0,1.0"
                            />
                        </div>
                        <div className="text-xs text-slate-500 text-center">— or fill form below —</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {(Object.keys(EMPTY_CUSTOM) as Array<keyof CustomDataInput>).map((k) => (
                                <div key={k}>
                                    <label className="text-xs text-slate-500 block mb-1">{k}</label>
                                    <input
                                        value={customInput[k]}
                                        onChange={(e) => setCustomInput((prev) => ({ ...prev, [k]: e.target.value }))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300"
                                        placeholder={k}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={injectCustomData} className="btn-success btn-sm">✅ Inject Data</button>
                            <button onClick={() => setShowCustomForm(false)} className="btn-neutral btn-sm">Cancel</button>
                        </div>
                    </div>
                )}

                {rawData && (
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <span className="text-sm text-emerald-400 font-medium">✓ {rawData.length} records loaded</span>
                            {dataSource && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${dataSource === 'api' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                    {dataSource === 'api' ? '🌐 NASA API' : '📁 Fallback'}
                                </span>
                            )}
                        </div>
                        <div className="overflow-x-auto rounded border border-slate-700">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        {previewCols.map((col) => (
                                            <th key={col}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, i) => (
                                        <tr key={i}>
                                            {previewCols.map((col) => (
                                                <td key={col} className="max-w-[120px] truncate" title={String(row[col] ?? '')}>
                                                    {row[col] == null ? <span className="text-slate-600 text-xs">null</span> : String(row[col])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">Showing first 20 of {rawData.length} rows · {Object.keys(rawData[0] ?? {}).length} columns</p>
                    </div>
                )}
            </div>

            {/* Stage 2: Data Profiling */}
            <div className="card space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <div className="section-label">Stage 2: Data Profiling</div>
                        <h2 className="text-lg font-semibold text-white">Automated Schema & Statistics</h2>
                    </div>
                    <StatusBadge status={stageStatuses.profiling as StageStatus} />
                </div>
                <button
                    onClick={profileDataStage}
                    disabled={!rawData || stageStatuses.profiling === 'running'}
                    className="btn-primary"
                >
                    {stageStatuses.profiling === 'running' ? '⏳ Profiling...' : '📊 Profile Data'}
                </button>

                {profile && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="card bg-slate-900/60 p-3">
                                <div className="text-2xl font-bold text-cyan-400">{profile.rowCount}</div>
                                <div className="text-xs text-slate-500">Rows</div>
                            </div>
                            <div className="card bg-slate-900/60 p-3">
                                <div className="text-2xl font-bold text-violet-400">{profile.columnCount}</div>
                                <div className="text-xs text-slate-500">Columns</div>
                            </div>
                            <div className="card bg-slate-900/60 p-3">
                                <div className="text-2xl font-bold text-emerald-400">{profile.completeness.toFixed(1)}%</div>
                                <div className="text-xs text-slate-500">Completeness</div>
                            </div>
                        </div>

                        {/* Stats table */}
                        <div className="overflow-x-auto rounded border border-slate-700">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Column</th>
                                        <th>Type</th>
                                        <th>Count</th>
                                        <th>Missing %</th>
                                        <th>Mean / Top</th>
                                        <th>Std / Unique</th>
                                        <th>Min</th>
                                        <th>Max</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {profile.columns.map((col) => (
                                        <tr key={col.name}>
                                            <td className="font-mono text-cyan-400">{col.name}</td>
                                            <td>
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${col.type === 'numeric' ? 'bg-blue-900/50 text-blue-300' : 'bg-purple-900/50 text-purple-300'}`}>
                                                    {col.type}
                                                </span>
                                            </td>
                                            <td>{col.count}</td>
                                            <td className={col.missingPct > 30 ? 'text-red-400' : col.missingPct > 10 ? 'text-yellow-400' : 'text-emerald-400'}>
                                                {col.missingPct.toFixed(1)}%
                                            </td>
                                            <td>{col.type === 'numeric' ? col.mean?.toFixed(2) : col.topValues?.[0]}</td>
                                            <td>{col.type === 'numeric' ? col.std?.toFixed(2) : col.unique}</td>
                                            <td>{col.type === 'numeric' ? col.min?.toFixed(2) : '—'}</td>
                                            <td>{col.type === 'numeric' ? col.max?.toFixed(2) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mini histograms */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {['pl_orbper', 'pl_rade', 'pl_bmasse'].map((colName) => {
                                const col = profile.columns.find((c) => c.name === colName);
                                if (!col) return null;
                                const chartData = getHistogramData(col);
                                if (!chartData) return null;
                                return (
                                    <div key={colName} className="card bg-slate-900/60">
                                        <div className="text-xs text-slate-400 mb-2 font-mono">{colName}</div>
                                        <div style={{ height: 150 }}>
                                            <Bar data={chartData} options={{ ...CHART_OPTS, maintainAspectRatio: false }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Stage 3: Preprocessing */}
            <div className="card space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <div className="section-label">Stage 3: Data Preprocessing</div>
                        <h2 className="text-lg font-semibold text-white">Normalize, Impute & Engineer Features</h2>
                    </div>
                    <StatusBadge status={stageStatuses.preprocessing as StageStatus} />
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={preprocessData}
                        disabled={!rawData || !profile || stageStatuses.preprocessing === 'running'}
                        className="btn-primary"
                    >
                        {stageStatuses.preprocessing === 'running' ? '⏳ Processing...' : '🔧 Preprocess Data'}
                    </button>
                    <button
                        onClick={preprocessData}
                        disabled={!rawData || !profile || stageStatuses.preprocessing === 'running'}
                        className="btn-neutral"
                    >
                        🎯 Feature Engineering
                    </button>
                </div>

                {processedData && (
                    <div className="space-y-4">
                        {/* Operations summary */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {imputeCounts && (
                                <div className="card bg-slate-900/60 p-3">
                                    <div className="text-xs text-slate-500 mb-1">Missing Values</div>
                                    <div className="text-sm font-bold text-white">{imputeCounts.before} → {imputeCounts.after}</div>
                                    <div className="text-xs text-emerald-400">Imputed (median)</div>
                                </div>
                            )}
                            <div className="card bg-slate-900/60 p-3">
                                <div className="text-xs text-slate-500 mb-1">Normalization</div>
                                <div className="text-sm font-bold text-white">{NUMERIC_COLS.length} cols</div>
                                <div className="text-xs text-cyan-400">Min-Max scaled</div>
                            </div>
                            <div className="card bg-slate-900/60 p-3">
                                <div className="text-xs text-slate-500 mb-1">Outliers Flagged</div>
                                <div className="text-sm font-bold text-white">
                                    {Object.values(outlierCounts).reduce((s, v) => s + v, 0)}
                                </div>
                                <div className="text-xs text-yellow-400">IQR method</div>
                            </div>
                            <div className="card bg-slate-900/60 p-3">
                                <div className="text-xs text-slate-500 mb-1">New Features</div>
                                <div className="text-sm font-bold text-white">3</div>
                                <div className="text-xs text-violet-400">Engineered</div>
                            </div>
                        </div>

                        {/* Outliers by col */}
                        {Object.entries(outlierCounts).length > 0 && (
                            <div>
                                <div className="text-xs text-slate-400 mb-2">Outliers per column:</div>
                                <div className="flex gap-3 flex-wrap">
                                    {Object.entries(outlierCounts).map(([col, count]) => (
                                        <span key={col} className="text-xs bg-yellow-900/30 text-yellow-300 px-2 py-1 rounded">
                                            {col}: {count}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* New features highlight */}
                        <div>
                            <div className="text-xs text-slate-400 mb-2">Engineered features:</div>
                            <div className="flex gap-3 flex-wrap">
                                {newCols.map((col) => (
                                    <span key={col} className="text-xs bg-violet-900/30 text-violet-300 px-2 py-1 rounded border border-violet-800/50">
                                        ✨ {col}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Processed data table */}
                        <div>
                            <div className="text-xs text-slate-400 mb-2">
                                Processed data preview ({processedData.length} rows, {Object.keys(processedData[0] ?? {}).length} features):
                            </div>
                            <div className="overflow-x-auto rounded border border-slate-700">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            {processedCols.map((col) => (
                                                <th key={col} className={newCols.includes(col) ? 'text-violet-400' : ''}>
                                                    {newCols.includes(col) ? '✨ ' : ''}{col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {processedData.slice(0, 10).map((row, i) => (
                                            <tr key={i}>
                                                {processedCols.map((col) => (
                                                    <td key={col} className={`max-w-[120px] truncate ${newCols.includes(col) ? 'text-violet-300' : ''}`}>
                                                        {row[col] == null ? <span className="text-slate-600 text-xs">null</span> : typeof row[col] === 'number' ? (row[col] as number).toFixed(3) : String(row[col])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Stage 4: Validation */}
            <div className="card space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <div className="section-label">Stage 4: Data Validation</div>
                        <h2 className="text-lg font-semibold text-white">Schema & Distribution Checks</h2>
                    </div>
                    <StatusBadge status={stageStatuses.validation as StageStatus} />
                </div>
                <button
                    onClick={validateDataStage}
                    disabled={!processedData || !profile || stageStatuses.validation === 'running'}
                    className="btn-primary"
                >
                    {stageStatuses.validation === 'running' ? '⏳ Validating...' : '✅ Validate Data'}
                </button>

                {validationResults && (
                    <div className="space-y-2">
                        {validationResults.checks.map((check) => (
                            <div
                                key={check.name}
                                className={`flex items-start gap-3 p-3 rounded-lg border ${check.pass ? 'border-emerald-800/50 bg-emerald-900/10' : 'border-red-800/50 bg-red-900/10'}`}
                            >
                                <span className="text-lg mt-0.5">{check.pass ? '✅' : '❌'}</span>
                                <div>
                                    <div className={`font-medium text-sm ${check.pass ? 'text-emerald-300' : 'text-red-300'}`}>
                                        {check.name}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-0.5">{check.detail}</div>
                                </div>
                            </div>
                        ))}
                        <div className="text-sm text-slate-400 mt-2">
                            {validationResults.checks.filter((c) => c.pass).length}/{validationResults.checks.length} checks passed
                        </div>
                    </div>
                )}
            </div>

            {/* Execution Log */}
            <div className="card">
                <div className="section-label">Execution Log</div>
                <div className="log-panel">
                    {logs.length === 0 ? (
                        <span className="text-slate-600">No pipeline events yet. Start with Stage 1.</span>
                    ) : (
                        logs.map((entry, i) => {
                            const cls = entry.includes('[INGESTION]') ? 'log-ingestion' :
                                entry.includes('[PROFILING]') ? 'log-profiling' :
                                entry.includes('[PREPROCESSING]') ? 'log-preprocessing' :
                                entry.includes('[VALIDATION]') ? 'log-nas' : 'log-info';
                            return <div key={i} className={cls}>{entry}</div>;
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
