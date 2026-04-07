'use client';
import React, { useState, useRef, useEffect } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ── Paper Data (Table I) ──────────────────────────────────────────────────────
const METHODS = ['Random Search', 'ENAS', 'DARTS', 'Vectra-Net'];
const TEST_ERROR = [3.29, 2.89, 3.00, 2.85];
const SEARCH_COST = [4.0, 0.5, 1.5, 0.4];
const PARAMS = [3.2, 4.6, 3.3, 3.4];

// ── Paper Data (Table II) ─────────────────────────────────────────────────────
const DRIFT_METHODS = ['Standard MLOps (ResNet-18)', 'Vectra-Net (Closed-Loop)'];
const PRE_DEPLOY = [95.1, 95.1];
const POST_DRIFT = [87.3, 89.5];
const AFTER_ADAPT = [89.5, 94.2];
const RECOVERY_EPOCHS = [30, 42];
const ARCH_CHANGE = ['None (Retrain Only)', 'Cell adapted (Dilated Conv preferred)'];

const BAR_COLORS = {
    'Random Search': 'rgba(148,163,184,0.8)',
    ENAS: 'rgba(124,58,237,0.8)',
    DARTS: 'rgba(59,130,246,0.8)',
    'Vectra-Net': 'rgba(0,212,255,0.9)'
};
const BAR_BORDER = {
    'Random Search': 'rgba(148,163,184,1)',
    ENAS: 'rgba(124,58,237,1)',
    DARTS: 'rgba(59,130,246,1)',
    'Vectra-Net': 'rgba(0,212,255,1)'
};

const AXIS_STYLE = { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#1e293b' } };
const LEGEND_STYLE = { labels: { color: '#94a3b8' } };

// Drift timeline data points (40 time steps)
function buildDriftTimeline() {
    const labels = Array.from({ length: 40 }, (_, i) => (i + 1).toString());
    // Standard MLOps: drops at step 15, recovers slowly
    const standard = labels.map((_, i) => {
        if (i < 15) return 95.1;
        if (i < 20) return 95.1 - (i - 14) * 1.56; // drops to 87.3
        if (i < 50) return 87.3 + (i - 19) * (89.5 - 87.3) / 30;
        return 89.5;
    });
    // Vectra-Net: drops slightly more, then recovers much better
    const vectranet = labels.map((_, i) => {
        if (i < 15) return 95.1;
        if (i < 20) return 95.1 - (i - 14) * 1.12; // drops to 89.5
        if (i < 26) return 89.5 - (i - 19) * 0.15; // small search cost dip
        if (i < 39) return 89.5 + (i - 25) * (94.2 - 89.5) / 13;
        return 94.2;
    });
    return { labels, standard, vectranet };
}

const driftTimeline = buildDriftTimeline();

export default function Comparison() {
    const [animated, setAnimated] = useState(false);
    const [view, setView] = useState<'closed' | 'open'>('closed');
    const [showData, setShowData] = useState(false);
    const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function animateResults() {
        setShowData(false);
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        animTimerRef.current = setTimeout(() => {
            setShowData(true);
            setAnimated(true);
        }, 300);
    }

    useEffect(() => {
        setShowData(true);
        setAnimated(true);
    }, []);

    function downloadReport() {
        const rows = [
            ['Method', 'Test Error (%)', 'Search Cost (GPU-Days)', 'Parameters (M)'],
            ...METHODS.map((m, i) => [m, TEST_ERROR[i], SEARCH_COST[i], PARAMS[i]]),
            [],
            ['Drift Adaptation Comparison'],
            ['Method', 'Pre-Deploy Acc (%)', 'Post-Drift Acc (%)', 'After Adaptation (%)', 'Recovery Epochs', 'Architecture Change'],
            ...DRIFT_METHODS.map((m, i) => [m, PRE_DEPLOY[i], POST_DRIFT[i], AFTER_ADAPT[i], RECOVERY_EPOCHS[i], ARCH_CHANGE[i]])
        ];
        const csv = rows.map((r) => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vectranet_comparison_report.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    const barColors = METHODS.map((m) => BAR_COLORS[m as keyof typeof BAR_COLORS]);
    const barBorders = METHODS.map((m) => BAR_BORDER[m as keyof typeof BAR_BORDER]);

    const errorChartData = {
        labels: showData ? METHODS : [],
        datasets: [{
            label: 'Test Error (%)',
            data: showData ? TEST_ERROR : [],
            backgroundColor: barColors,
            borderColor: barBorders,
            borderWidth: 2
        }]
    };

    const costChartData = {
        labels: showData ? METHODS : [],
        datasets: [{
            label: 'Search Cost (GPU-Days)',
            data: showData ? SEARCH_COST : [],
            backgroundColor: barColors,
            borderColor: barBorders,
            borderWidth: 2
        }]
    };

    const paramsChartData = {
        labels: showData ? METHODS : [],
        datasets: [{
            label: 'Parameters (M)',
            data: showData ? PARAMS : [],
            backgroundColor: barColors,
            borderColor: barBorders,
            borderWidth: 2
        }]
    };

    const driftLineData = {
        labels: driftTimeline.labels,
        datasets: [
            {
                label: 'Standard MLOps (ResNet-18)',
                data: showData ? driftTimeline.standard : [],
                borderColor: 'rgba(148,163,184,0.9)',
                backgroundColor: 'rgba(148,163,184,0.1)',
                tension: 0.3,
                fill: false,
                pointRadius: 0
            },
            {
                label: 'Vectra-Net (Closed-Loop)',
                data: showData ? driftTimeline.vectranet : [],
                borderColor: 'rgba(0,212,255,0.9)',
                backgroundColor: 'rgba(0,212,255,0.1)',
                tension: 0.3,
                fill: false,
                pointRadius: 0,
                borderWidth: 2
            }
        ]
    };

    const chartOpts = (title: string, yLabel: string, lowerBetter = true) => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: title, color: '#cbd5e1', font: { size: 12 } },
            tooltip: {
                callbacks: {
                    label: (ctx: { dataset: { label: string }; parsed: { y: number } }) => {
                        return `${ctx.dataset.label}: ${ctx.parsed.y}`;
                    }
                }
            }
        },
        scales: { x: AXIS_STYLE, y: { ...AXIS_STYLE, title: { display: true, text: yLabel, color: '#64748b' } } }
    });

    const lineOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: LEGEND_STYLE,
            tooltip: {},
            annotation: {}
        },
        scales: {
            x: { ...AXIS_STYLE, title: { display: true, text: 'Time Step', color: '#64748b' } },
            y: { ...AXIS_STYLE, min: 85, title: { display: true, text: 'Accuracy (%)', color: '#64748b' } }
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Method Comparison</h1>
                <p className="text-slate-400 mt-1">Vectra-Net vs. state-of-the-art NAS methods · Data from research paper Tables I & II</p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
                <button onClick={() => { setShowData(false); animateResults(); }} className="btn-primary">
                    📊 Run Comparison
                </button>
                <button onClick={() => setView(view === 'closed' ? 'open' : 'closed')} className="btn-neutral">
                    🔄 Toggle: {view === 'closed' ? 'Open-Loop' : 'Closed-Loop'}
                </button>
                <button onClick={animateResults} className="btn-neutral">
                    📈 Animate Results
                </button>
                <button onClick={downloadReport} className="btn-neutral">
                    📥 Download Comparison Report
                </button>
            </div>

            {/* Chart 1: Search Efficiency (Table I) */}
            <div className="card space-y-4">
                <div className="section-label">Table I: Search Efficiency & Accuracy (CIFAR-10)</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="card bg-slate-900/60">
                        <div style={{ height: 220 }}>
                            <Bar data={errorChartData} options={chartOpts('Test Error (%)', 'Error %') as never} />
                        </div>
                        <p className="text-xs text-slate-500 text-center mt-2">Lower is better ↓</p>
                    </div>
                    <div className="card bg-slate-900/60">
                        <div style={{ height: 220 }}>
                            <Bar data={costChartData} options={chartOpts('Search Cost (GPU-Days)', 'GPU-Days') as never} />
                        </div>
                        <p className="text-xs text-slate-500 text-center mt-2">Lower is better ↓</p>
                    </div>
                    <div className="card bg-slate-900/60">
                        <div style={{ height: 220 }}>
                            <Bar data={paramsChartData} options={chartOpts('Parameters (M)', 'Params (M)') as never} />
                        </div>
                        <p className="text-xs text-slate-500 text-center mt-2">Lower is better ↓</p>
                    </div>
                </div>

                {/* Full comparison table */}
                <div className="overflow-x-auto rounded border border-slate-700">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Test Error (%)</th>
                                <th>Search Cost (GPU-Days)</th>
                                <th>Parameters (M)</th>
                                <th>Advantage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {METHODS.map((method, i) => (
                                <tr key={method} className={method === 'Vectra-Net' ? 'bg-cyan-900/10' : ''}>
                                    <td className={method === 'Vectra-Net' ? 'font-bold text-cyan-400' : ''}>{method}</td>
                                    <td className={TEST_ERROR[i] === Math.min(...TEST_ERROR) ? 'text-emerald-400 font-semibold' : ''}>{TEST_ERROR[i]}</td>
                                    <td className={SEARCH_COST[i] === Math.min(...SEARCH_COST) ? 'text-emerald-400 font-semibold' : ''}>{SEARCH_COST[i]}</td>
                                    <td>{PARAMS[i]}</td>
                                    <td className="text-xs">
                                        {method === 'Vectra-Net' ? (
                                            <span className="text-cyan-400 font-medium">✓ Best accuracy &amp; 10x faster than Random Search</span>
                                        ) : method === 'ENAS' ? (
                                            <span className="text-slate-400">Fast but lower accuracy</span>
                                        ) : method === 'DARTS' ? (
                                            <span className="text-slate-400">Good accuracy, higher cost</span>
                                        ) : (
                                            <span className="text-slate-500">Baseline reference</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-4 py-2">
                        <span className="text-cyan-400 font-semibold">Vectra-Net</span>
                        <span className="text-slate-300"> achieves lowest test error </span>
                        <span className="text-cyan-400 font-bold">2.85%</span>
                        <span className="text-slate-300"> at only </span>
                        <span className="text-cyan-400 font-bold">0.40 GPU-days</span>
                        <span className="text-slate-300"> — 10× faster than Random Search</span>
                    </div>
                </div>
            </div>

            {/* Chart 2: Drift Adaptation (Table II) */}
            <div className="card space-y-4">
                <div className="section-label">Table II: Drift Adaptation Performance</div>
                <div className="card bg-slate-900/60">
                    <div className="text-xs text-slate-400 mb-3">
                        Accuracy over time: Pre-deployment → Drift Event (step 15) → Recovery/Adaptation
                    </div>
                    <div className="relative" style={{ height: 280 }}>
                        <Line data={driftLineData} options={lineOpts as never} />
                        {/* Drift marker annotation */}
                        <div className="absolute top-2 left-[38%] flex flex-col items-center pointer-events-none">
                            <div className="h-4 w-px bg-red-500/60" />
                            <span className="text-xs text-red-400 bg-slate-900/80 px-1 rounded mt-0.5">⚡ Drift</span>
                        </div>
                    </div>
                </div>

                {/* +4.7% callout */}
                <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-700/50 rounded-xl p-4">
                    <div className="text-3xl font-bold text-emerald-400">+4.7%</div>
                    <div>
                        <div className="font-semibold text-white">Accuracy Improvement After Adaptation</div>
                        <div className="text-sm text-slate-400">
                            Vectra-Net closed-loop recovers to <strong className="text-emerald-400">94.2%</strong> vs Standard MLOps{' '}
                            <strong className="text-slate-300">89.5%</strong> — through NAS-driven architecture adaptation
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto rounded border border-slate-700">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Pre-Deploy (%)</th>
                                <th>Post-Drift (%)</th>
                                <th>After Adapt (%)</th>
                                <th>Recovery Epochs</th>
                                <th>Architecture Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {DRIFT_METHODS.map((m, i) => (
                                <tr key={m} className={i === 1 ? 'bg-cyan-900/10' : ''}>
                                    <td className={i === 1 ? 'font-bold text-cyan-400' : ''}>{m}</td>
                                    <td>{PRE_DEPLOY[i]}</td>
                                    <td className={i === 1 ? 'text-yellow-400' : 'text-red-400'}>{POST_DRIFT[i]}</td>
                                    <td className={i === 1 ? 'text-emerald-400 font-bold' : ''}>{AFTER_ADAPT[i]}</td>
                                    <td>{RECOVERY_EPOCHS[i]}</td>
                                    <td className="text-xs text-slate-400">{ARCH_CHANGE[i]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Chart 3: Open-Loop vs Closed-Loop */}
            <div className="card space-y-4">
                <div className="section-label">Open-Loop vs Closed-Loop Architecture</div>
                <div className="flex gap-2 mb-2">
                    <button onClick={() => setView('open')} className={`btn-sm ${view === 'open' ? 'btn-warning' : 'btn-neutral'}`}>Open-Loop</button>
                    <button onClick={() => setView('closed')} className={`btn-sm ${view === 'closed' ? 'btn-primary' : 'btn-neutral'}`}>Closed-Loop (Vectra-Net)</button>
                </div>

                {view === 'open' ? (
                    <div className="space-y-3">
                        <div className="text-sm text-slate-400 mb-2">Traditional open-loop MLOps — no architecture adaptation</div>
                        <div className="flex flex-wrap items-center gap-2">
                            {['Design', 'Deploy', 'Monitor', 'Retrain\n(same arch)', 'Deploy'].map((step, i) => (
                                <React.Fragment key={i}>
                                    <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border border-slate-600 bg-slate-800 min-w-[90px] text-center">
                                        <div className="text-base">
                                            {['📐', '🚀', '👁', '🔄', '🚀'][i]}
                                        </div>
                                        <div className="text-xs font-medium text-white whitespace-pre-line">{step}</div>
                                    </div>
                                    {i < 4 && <div className="text-slate-500 text-lg">→</div>}
                                </React.Fragment>
                            ))}
                        </div>
                        <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800/50 rounded p-3 mt-2">
                            ⚠️ Limitation: Architecture never changes. After drift, model is retrained on corrupted distribution but architecture bias remains. Max recovery: <strong>89.5%</strong>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="text-sm text-slate-400 mb-2">Vectra-Net closed-loop — continuous architecture adaptation</div>
                        <div className="flex flex-wrap items-center gap-2">
                            {['Design', 'Deploy', 'Monitor', 'Drift\nDetected', 'Constrained\nNAS', 'New Arch', 'Deploy'].map((step, i) => (
                                <React.Fragment key={i}>
                                    <div className={`flex flex-col items-center gap-1 px-3 py-3 rounded-lg border min-w-[80px] text-center ${i === 3 ? 'border-red-600/60 bg-red-900/20' : i === 4 ? 'border-violet-600/60 bg-violet-900/20' : i === 5 ? 'border-emerald-600/60 bg-emerald-900/20' : 'border-slate-600 bg-slate-800'}`}>
                                        <div className="text-base">
                                            {['📐', '🚀', '👁', '⚠️', '🔍', '🧠', '🚀'][i]}
                                        </div>
                                        <div className="text-xs font-medium text-white whitespace-pre-line">{step}</div>
                                    </div>
                                    {i < 6 && <div className="text-slate-500 text-lg">→</div>}
                                </React.Fragment>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="text-slate-500 text-sm">↑</div>
                            <div className="flex-1 h-px border-t border-dashed border-cyan-500/40" />
                            <div className="text-xs text-cyan-500">Feedback loop</div>
                            <div className="flex-1 h-px border-t border-dashed border-cyan-500/40" />
                        </div>
                        <div className="text-xs text-cyan-400 bg-cyan-900/10 border border-cyan-800/40 rounded p-3 mt-2">
                            ✅ Vectra-Net advantage: Constrained NAS (12 search + 30 training epochs) discovers drift-adapted architecture. Recovery to <strong>94.2%</strong> — 4.7% higher than standard retraining.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
