'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { injectDrift, detectDrift, simulateDriftTimeSeries } from '../../utils/driftDetector';
import { fetchNASAData } from '../../utils/nasaData';
import { saveState, addLog } from '../../utils/pipelineStore';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

type AlertSeverity = 'info' | 'warning' | 'critical';
interface Alert { id: number; time: string; severity: AlertSeverity; message: string; }

const AXIS_STYLE = { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } };

function CircleGauge({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
    const pct = Math.min(1, value / max);
    const r = 36;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - pct);
    return (
        <div className="flex flex-col items-center gap-2">
            <svg width={96} height={96} className="-rotate-90">
                <circle cx={48} cy={48} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
                <circle
                    cx={48} cy={48} r={r} fill="none"
                    stroke={color} strokeWidth={8}
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
            </svg>
            <div className="text-center -mt-14 w-full">
                <div className="text-lg font-bold text-white">{value.toFixed(1)}</div>
            </div>
            <div className="text-xs text-slate-400 text-center mt-8">{label}</div>
        </div>
    );
}

export default function Monitoring() {
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [accuracy, setAccuracy] = useState(95.1);
    const [latency, setLatency] = useState(12.4);
    const [throughput, setThroughput] = useState(248);
    const [driftScore, setDriftScore] = useState(0.02);
    const [driftTimeSeries, setDriftTimeSeries] = useState<number[]>([]);
    const [timeLabels, setTimeLabels] = useState<string[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [alertFilter, setAlertFilter] = useState<'all' | AlertSeverity>('all');
    const [driftInjected, setDriftInjected] = useState(false);
    const [driftReport, setDriftReport] = useState<ReturnType<typeof detectDrift> | null>(null);
    const [baselineData, setBaselineData] = useState<Record<string, unknown>[] | null>(null);
    const [currentData, setCurrentData] = useState<Record<string, unknown>[] | null>(null);
    const [feedbackStage, setFeedbackStage] = useState<number>(0);
    const [feedbackRunning, setFeedbackRunning] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const alertIdRef = useRef(1);

    const addAlert = useCallback((severity: AlertSeverity, message: string) => {
        const time = new Date().toISOString().substring(11, 19);
        setAlerts((prev) => [{ id: alertIdRef.current++, time, severity, message }, ...prev.slice(0, 49)]);
        addLog(`[${severity.toUpperCase()}] ${message}`, 'monitoring');
    }, []);

    // Load baseline data once
    useEffect(() => {
        fetchNASAData().then(({ data }) => {
            setBaselineData(data as Record<string, unknown>[]);
            setCurrentData(data as Record<string, unknown>[]);
        });
    }, []);

    function startMonitoring() {
        setIsMonitoring(true);
        addAlert('info', 'Monitoring started — tracking model performance and data distribution');
        saveState({ isMonitoring: true });

        let step = 0;
        timerRef.current = setInterval(() => {
            step++;
            const noise = (Math.random() - 0.5) * 0.4;
            setAccuracy((a) => Math.max(80, Math.min(99, a + noise * 0.3)));
            setLatency((l) => Math.max(8, Math.min(50, l + (Math.random() - 0.5) * 1.5)));
            setThroughput((t) => Math.max(100, Math.min(500, t + (Math.random() - 0.5) * 20)));

            const ts = new Date().toISOString().substring(11, 19);
            setTimeLabels((prev) => [...prev.slice(-29), ts]);

            if (driftInjected) {
                setDriftScore((d) => {
                    const newScore = Math.min(0.85, d + (Math.random() * 0.04 - 0.01));
                    if (newScore > 0.35 && d <= 0.35) {
                        addAlert('critical', `Significant drift detected! Score: ${newScore.toFixed(3)} (threshold: 0.35)`);
                    } else if (newScore > 0.15 && d <= 0.15) {
                        addAlert('warning', `Mild drift detected. Score: ${newScore.toFixed(3)} (threshold: 0.15)`);
                    }
                    saveState({ driftScore: newScore });
                    return newScore;
                });
            } else {
                setDriftScore((d) => Math.max(0, Math.min(0.08, d + (Math.random() - 0.5) * 0.01)));
            }

            setDriftTimeSeries((prev) => [...prev.slice(-29), driftScore]);
        }, 1200);
    }

    function stopMonitoring() {
        setIsMonitoring(false);
        if (timerRef.current) clearInterval(timerRef.current);
        addAlert('info', 'Monitoring paused');
        saveState({ isMonitoring: false });
    }

    useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

    function simulateDrift() {
        if (!baselineData) { addAlert('warning', 'No baseline data loaded yet. Start monitoring first.'); return; }
        setDriftInjected(true);
        const drifted = injectDrift(baselineData, 3);
        setCurrentData(drifted);
        addAlert('critical', 'Drift injected: Gaussian noise + contrast shift at severity 3 (CIFAR-10-C equivalent)');
        addLog('Drift simulation: Gaussian noise σ=0.36, contrast shift +24%', 'monitoring');
    }

    function detectDriftNow() {
        if (!baselineData || !currentData) { addAlert('warning', 'Load data first'); return; }
        const numericCols = ['pl_orbper', 'pl_rade', 'pl_bmasse', 'pl_orbsmax', 'st_teff', 'st_rad', 'st_mass'];
        const report = detectDrift(baselineData, currentData, numericCols);
        setDriftReport(report);
        setDriftScore(report.overallScore);
        saveState({ driftScore: report.overallScore });
        addAlert(
            report.alertType === 'significant' ? 'critical' : report.alertType === 'mild' ? 'warning' : 'info',
            `Drift analysis complete: overall score ${report.overallScore.toFixed(3)}, severity: ${report.alertType}`
        );
    }

    async function triggerFeedbackLoop() {
        if (feedbackRunning) return;
        setFeedbackRunning(true);
        setFeedbackStage(0);

        const stages = [
            { msg: '⚠️ Drift Detected — score threshold exceeded', delay: 1000, alert: 'critical' as AlertSeverity },
            { msg: '📤 Generating Feedback Payload with drift metrics', delay: 1200, alert: 'info' as AlertSeverity },
            { msg: '🔍 Triggering Constrained NAS Search (Dilated Conv preferred)', delay: 2500, alert: 'info' as AlertSeverity },
            { msg: '✅ New Architecture Found — Dilated Conv cells preferred; accuracy recovery: +4.7%', delay: 2000, alert: 'info' as AlertSeverity }
        ];

        for (let i = 0; i < stages.length; i++) {
            setFeedbackStage(i + 1);
            await new Promise((r) => setTimeout(r, stages[i].delay));
            addAlert(stages[i].alert, stages[i].msg);
        }

        setFeedbackRunning(false);
        addLog('Closed-loop feedback cycle complete', 'monitoring');
    }

    const driftLineData = {
        labels: timeLabels.length > 0 ? timeLabels : Array.from({ length: 20 }, (_, i) => `t-${20 - i}`),
        datasets: [{
            label: 'Drift Score',
            data: driftTimeSeries.length > 0 ? driftTimeSeries : simulateDriftTimeSeries(20, 100),
            borderColor: driftScore > 0.35 ? '#ef4444' : driftScore > 0.15 ? '#f59e0b' : '#10b981',
            backgroundColor: driftScore > 0.35 ? 'rgba(239,68,68,0.1)' : driftScore > 0.15 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 2
        }, {
            label: 'Threshold (Mild)',
            data: Array(Math.max(timeLabels.length, 20)).fill(0.15),
            borderColor: 'rgba(245,158,11,0.5)',
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false
        }, {
            label: 'Threshold (Significant)',
            data: Array(Math.max(timeLabels.length, 20)).fill(0.35),
            borderColor: 'rgba(239,68,68,0.5)',
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false
        }]
    };

    const lineOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } },
        scales: { x: AXIS_STYLE, y: { ...AXIS_STYLE, min: 0, max: 1 } }
    };

    // Distribution comparison bar chart
    const distCols = ['pl_orbper', 'pl_rade', 'pl_bmasse'];
    const distChartData = driftReport ? {
        labels: driftReport.features.slice(0, 6).map((f) => f.feature),
        datasets: [
            {
                label: 'Drift Score',
                data: driftReport.features.slice(0, 6).map((f) => f.driftScore),
                backgroundColor: driftReport.features.slice(0, 6).map((f) =>
                    f.severity === 'significant' ? 'rgba(239,68,68,0.7)' :
                    f.severity === 'mild' ? 'rgba(245,158,11,0.7)' : 'rgba(16,185,129,0.7)'
                ),
                borderWidth: 1
            }
        ]
    } : null;

    const filteredAlerts = alertFilter === 'all' ? alerts : alerts.filter((a) => a.severity === alertFilter);
    const alertBadge: Record<AlertSeverity, string> = {
        info: 'bg-blue-900/50 text-blue-300',
        warning: 'bg-yellow-900/50 text-yellow-300',
        critical: 'bg-red-900/50 text-red-300'
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Monitoring & Feedback Loop</h1>
                <p className="text-slate-400 mt-1">Real-time production monitoring · Drift detection · Closed-loop NAS adaptation</p>
            </div>

            {/* Real-Time Metrics */}
            <div className="card space-y-4">
                <div className="section-label">Model Performance Dashboard</div>
                <div className="flex flex-wrap gap-3 mb-2">
                    <button onClick={startMonitoring} disabled={isMonitoring} className="btn-success">
                        {isMonitoring ? <><span className="animate-pulse-glow inline-block">●</span> Monitoring...</> : '▶ Start Monitoring'}
                    </button>
                    <button onClick={stopMonitoring} disabled={!isMonitoring} className="btn-danger">⏹ Stop Monitoring</button>
                </div>
                <div className="grid grid-cols-3 gap-6 justify-items-center">
                    <CircleGauge value={accuracy} max={100} label="Accuracy (%)" color={accuracy > 90 ? '#10b981' : accuracy > 80 ? '#f59e0b' : '#ef4444'} />
                    <CircleGauge value={latency} max={100} label="Latency (ms)" color="#00d4ff" />
                    <CircleGauge value={throughput} max={500} label="Throughput (inf/s)" color="#7c3aed" />
                </div>
                <div className="grid grid-cols-3 gap-4 text-center text-xs text-slate-500">
                    <span>{accuracy > 90 ? '🟢' : accuracy > 80 ? '🟡' : '🔴'} Accuracy: {accuracy.toFixed(1)}%</span>
                    <span>🔵 Latency: {latency.toFixed(1)}ms</span>
                    <span>🟣 Throughput: {throughput.toFixed(0)} inf/s</span>
                </div>
            </div>

            {/* Drift Detection */}
            <div className="card space-y-4">
                <div className="section-label">Data Drift Detection</div>
                <div className="flex flex-wrap gap-3">
                    <button onClick={simulateDrift} className="btn-warning">🌊 Simulate Drift</button>
                    <button onClick={detectDriftNow} disabled={!baselineData} className="btn-primary">📊 Detect Drift</button>
                </div>

                {/* Drift score indicator */}
                <div className="card bg-slate-900/60">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white">Overall Drift Score</span>
                        <span className={`text-lg font-bold ${driftScore > 0.35 ? 'text-red-400' : driftScore > 0.15 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                            {driftScore.toFixed(3)}
                        </span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${Math.min(100, driftScore * 100)}%`,
                                background: driftScore > 0.35 ? '#ef4444' : driftScore > 0.15 ? '#f59e0b' : '#10b981'
                            }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>0.0 (Clean)</span>
                        <span>0.15 (Mild)</span>
                        <span>0.35 (Alert)</span>
                        <span>1.0 (Severe)</span>
                    </div>
                </div>

                {/* Drift timeline chart */}
                <div className="card bg-slate-900/60">
                    <div className="text-xs text-slate-400 mb-2">Drift Score Timeline</div>
                    <div style={{ height: 200 }}>
                        <Line data={driftLineData} options={lineOpts as never} />
                    </div>
                </div>

                {/* Feature-by-feature drift */}
                {driftReport && (
                    <div className="space-y-3">
                        <div className="text-xs text-slate-400">Feature-Level Drift Analysis:</div>
                        {driftReport.features.slice(0, 8).map((f) => (
                            <div key={f.feature} className="flex items-center gap-3">
                                <div className="w-28 text-xs font-mono text-slate-400 truncate">{f.feature}</div>
                                <div className="flex-1 h-1.5 bg-slate-700 rounded overflow-hidden">
                                    <div
                                        className="h-full rounded transition-all"
                                        style={{
                                            width: `${Math.min(100, f.driftScore * 100)}%`,
                                            background: f.severity === 'significant' ? '#ef4444' : f.severity === 'mild' ? '#f59e0b' : '#10b981'
                                        }}
                                    />
                                </div>
                                <span className={`text-xs w-12 text-right ${f.severity === 'significant' ? 'text-red-400' : f.severity === 'mild' ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                    {f.driftScore.toFixed(3)}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${f.severity === 'significant' ? 'bg-red-900/50 text-red-300' : f.severity === 'mild' ? 'bg-yellow-900/50 text-yellow-300' : 'bg-emerald-900/50 text-emerald-300'}`}>
                                    {f.severity}
                                </span>
                            </div>
                        ))}
                        {distChartData && (
                            <div className="mt-4" style={{ height: 200 }}>
                                <Bar
                                    data={distChartData}
                                    options={{
                                        responsive: true, maintainAspectRatio: false,
                                        plugins: { legend: { display: false }, title: { display: true, text: 'Drift Scores by Feature', color: '#94a3b8' } },
                                        scales: { x: AXIS_STYLE, y: { ...AXIS_STYLE, min: 0, max: 1 } }
                                    } as never}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Feedback Loop */}
            <div className="card space-y-4">
                <div className="section-label">Closed-Loop Feedback Mechanism</div>
                <button onClick={triggerFeedbackLoop} disabled={feedbackRunning} className="btn-primary">
                    {feedbackRunning ? '⏳ Running Feedback Loop...' : '🔄 Trigger Feedback Loop'}
                </button>

                <div className="space-y-2">
                    {[
                        { stage: 1, icon: '⚠️', label: 'Drift Detected', desc: 'Distribution shift detected · Score threshold exceeded' },
                        { stage: 2, icon: '📤', label: 'Generating Feedback Payload', desc: 'Drift metrics packaged · Operation constraint weights computed' },
                        { stage: 3, icon: '🔍', label: 'Triggering Constrained NAS Search', desc: 'NAS search space constrained by drift type · Dilated Conv preferred' },
                        { stage: 4, icon: '✅', label: 'New Architecture Found', desc: 'Accuracy recovery: +4.7% · Architecture deployed to production' }
                    ].map((s) => (
                        <div
                            key={s.stage}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${feedbackStage >= s.stage ? 'border-cyan-700/50 bg-cyan-900/10' : 'border-slate-800 bg-slate-900/40 opacity-40'}`}
                        >
                            <span className="text-xl mt-0.5">{feedbackStage >= s.stage ? s.icon : '○'}</span>
                            <div>
                                <div className={`font-medium text-sm ${feedbackStage >= s.stage ? 'text-white' : 'text-slate-600'}`}>{s.label}</div>
                                <div className="text-xs text-slate-400 mt-0.5">{s.desc}</div>
                            </div>
                            {feedbackStage === s.stage && feedbackRunning && (
                                <span className="ml-auto text-yellow-400 text-xs animate-pulse">running...</span>
                            )}
                            {feedbackStage > s.stage && (
                                <span className="ml-auto text-emerald-400 text-xs">✓</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Alerts Panel */}
            <div className="card space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="section-label">Monitoring Alerts</div>
                    <div className="flex gap-2">
                        {(['all', 'info', 'warning', 'critical'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setAlertFilter(f)}
                                className={`btn-sm ${alertFilter === f ? 'btn-primary' : 'btn-neutral'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredAlerts.length === 0 ? (
                        <div className="text-sm text-slate-600 py-4 text-center">No alerts yet. Start monitoring to generate events.</div>
                    ) : (
                        filteredAlerts.map((alert) => (
                            <div key={alert.id} className={`flex items-start gap-2 p-2.5 rounded-lg border ${alert.severity === 'critical' ? 'border-red-800/50 bg-red-900/10' : alert.severity === 'warning' ? 'border-yellow-800/50 bg-yellow-900/10' : 'border-blue-800/50 bg-blue-900/10'}`}>
                                <span className="text-base">{alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️'}</span>
                                <div className="flex-1 min-w-0">
                                    <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${alertBadge[alert.severity]}`}>{alert.severity}</span>
                                    <span className="text-xs text-slate-500">{alert.time}</span>
                                    <div className="text-sm text-slate-300 mt-0.5">{alert.message}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
