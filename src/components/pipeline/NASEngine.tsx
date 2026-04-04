'use client';
import React, { useState, useRef, useEffect } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
    CELL_OPERATIONS,
    simulateNASStep,
    buildArchitecture,
    type Architecture,
    type NASResult,
    type CellOperation
} from '../../utils/nasSimulator';
import { saveState, addLog } from '../../utils/pipelineStore';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const LINE_OPTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: {}
    },
    scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } },
        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } }
    }
};

interface SearchConfig {
    epochs: number;
    lr: number;
    numCells: number;
    gpuBudget: number;
}

const DEFAULT_CONFIG: SearchConfig = { epochs: 50, lr: 0.025, numCells: 4, gpuBudget: 2 };

export default function NASEngine() {
    const [config, setConfig] = useState<SearchConfig>(DEFAULT_CONFIG);
    const [showConfig, setShowConfig] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [progress, setProgress] = useState(0);
    const [opScores, setOpScores] = useState<Record<string, number>>({});
    const [history, setHistory] = useState<NASResult[]>([]);
    const [bestArch, setBestArch] = useState<Architecture | null>(null);
    const [currentIter, setCurrentIter] = useState(0);
    const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
    const [highlightedOp, setHighlightedOp] = useState<string | null>(null);
    const cancelRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function reset() {
        cancelRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        setIsSearching(false);
        setProgress(0);
        setOpScores({});
        setHistory([]);
        setBestArch(null);
        setCurrentIter(0);
        setCurrentAccuracy(null);
        setHighlightedOp(null);
        addLog('NAS search reset', 'nas');
    }

    function stopSearch() {
        cancelRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        setIsSearching(false);
        addLog('NAS search stopped by user', 'nas');
    }

    async function startSearch() {
        cancelRef.current = false;
        setIsSearching(true);
        setProgress(0);
        setHistory([]);
        setBestArch(null);
        setCurrentIter(0);
        setCurrentAccuracy(null);
        addLog(`Starting NAS: ${config.epochs} epochs, LR=${config.lr}, cells=${config.numCells}`, 'nas');

        let scores: Record<string, number> = {};
        let cumCost = 0;
        const results: NASResult[] = [];

        for (let i = 1; i <= config.epochs; i++) {
            if (cancelRef.current) break;

            await new Promise<void>((resolve) => {
                timerRef.current = setTimeout(resolve, 60);
            });

            if (cancelRef.current) break;

            // Highlight a random op during search
            const ops = CELL_OPERATIONS;
            setHighlightedOp(ops[i % ops.length].id);

            const step = simulateNASStep(scores, i, config.numCells, config.lr);
            scores = step.scores;
            cumCost += step.cost;

            setOpScores({ ...scores });
            setCurrentIter(i);
            setCurrentAccuracy(step.accuracy);
            setProgress((i / config.epochs) * 100);

            if (i % Math.max(1, Math.floor(config.epochs / 12)) === 0 || i === 1 || i === config.epochs) {
                const arch = buildArchitecture(scores, config.numCells, i);
                const result: NASResult = {
                    iteration: i,
                    architectureId: arch.id,
                    validationAccuracy: step.accuracy,
                    searchCost: +cumCost.toFixed(3),
                    description: arch.description,
                    params: arch.totalParams
                };
                results.push(result);
                setHistory([...results]);
                setBestArch(arch);
                if (i === config.epochs) {
                    addLog(`NAS complete. Best accuracy: ${step.accuracy}%, cost: ${cumCost.toFixed(3)} GPU-hrs`, 'nas');
                    saveState({
                        nasSearchDone: true,
                        bestArchDescription: arch.description,
                        bestArchAccuracy: step.accuracy,
                        stageStatuses: { ingestion: 'complete', profiling: 'complete', preprocessing: 'complete', nas: 'complete', monitoring: 'idle' }
                    });
                }
            }
        }

        setIsSearching(false);
        setHighlightedOp(null);
    }

    const chartData = history.length > 0 ? {
        labels: history.map((r) => `#${r.iteration}`),
        datasets: [
            {
                label: 'Validation Accuracy (%)',
                data: history.map((r) => r.validationAccuracy),
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0,212,255,0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }
        ]
    } : null;

    const costData = history.length > 0 ? {
        labels: history.map((r) => `#${r.iteration}`),
        datasets: [
            {
                label: 'Cumulative Search Cost (GPU-hrs)',
                data: history.map((r) => r.searchCost),
                borderColor: '#7c3aed',
                backgroundColor: 'rgba(124,58,237,0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 3
            }
        ]
    } : null;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Vectra-Net NAS Engine</h1>
                <p className="text-slate-400 mt-1">Gradient-based Neural Architecture Search · Cell-based DARTS-inspired search space</p>
            </div>

            {/* Search Controls */}
            <div className="card space-y-4">
                <div className="section-label">Architecture Search Controls</div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={startSearch}
                        disabled={isSearching}
                        className="btn-primary"
                    >
                        {isSearching ? (
                            <><span className="animate-spin-slow inline-block">⚙️</span> Searching...</>
                        ) : '🔍 Start Architecture Search'}
                    </button>
                    <button onClick={() => setShowConfig(!showConfig)} className="btn-neutral">
                        ⚙️ Configure Search
                    </button>
                    {isSearching && (
                        <button onClick={stopSearch} className="btn-danger">⏹ Stop Search</button>
                    )}
                    <button onClick={reset} disabled={isSearching} className="btn-neutral">
                        🔄 Reset
                    </button>
                </div>

                {/* Config panel */}
                {showConfig && (
                    <div className="card bg-slate-900/60 grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="section-label col-span-full">Search Configuration</div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">
                                Search Epochs: <span className="text-cyan-400">{config.epochs}</span>
                            </label>
                            <input
                                type="range" min={10} max={100} value={config.epochs}
                                onChange={(e) => setConfig((c) => ({ ...c, epochs: +e.target.value }))}
                                className="w-full accent-cyan-500"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">
                                Learning Rate: <span className="text-cyan-400">{config.lr}</span>
                            </label>
                            <input
                                type="number" min={0.001} max={0.1} step={0.001} value={config.lr}
                                onChange={(e) => setConfig((c) => ({ ...c, lr: +e.target.value }))}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">
                                Number of Cells: <span className="text-cyan-400">{config.numCells}</span>
                            </label>
                            <input
                                type="range" min={2} max={8} value={config.numCells}
                                onChange={(e) => setConfig((c) => ({ ...c, numCells: +e.target.value }))}
                                className="w-full accent-violet-500"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">
                                GPU Budget (hrs): <span className="text-cyan-400">{config.gpuBudget}</span>
                            </label>
                            <input
                                type="range" min={0.5} max={24} step={0.5} value={config.gpuBudget}
                                onChange={(e) => setConfig((c) => ({ ...c, gpuBudget: +e.target.value }))}
                                className="w-full accent-emerald-500"
                            />
                        </div>
                    </div>
                )}

                {/* Progress */}
                {(isSearching || progress > 0) && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-slate-400">
                            <span>Search Progress: Iteration {currentIter}/{config.epochs}</span>
                            <span>{progress.toFixed(0)}%</span>
                        </div>
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        {currentAccuracy && (
                            <div className="flex gap-4 text-xs">
                                <span className="text-cyan-400">Current Accuracy: <strong>{currentAccuracy}%</strong></span>
                                {history[history.length - 1] && (
                                    <span className="text-violet-400">Search Cost: <strong>{history[history.length - 1].searchCost} GPU-hrs</strong></span>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Cell Operations Grid */}
            <div className="card">
                <div className="section-label">Cell-Based Search Space</div>
                <p className="text-xs text-slate-500 mb-4">DARTS-style operations evaluated during architecture search. Brighter = higher learned weight.</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {CELL_OPERATIONS.map((op) => {
                        const score = opScores[op.id] ?? 0;
                        const isHighlighted = highlightedOp === op.id;
                        const opacity = Math.max(0.2, score);
                        return (
                            <div
                                key={op.id}
                                className={`rounded-lg border p-3 text-center transition-all ${isHighlighted ? 'border-yellow-400 bg-yellow-900/30 animate-pulse' : score > 0.6 ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-700 bg-slate-800/50'}`}
                                style={{ opacity: isHighlighted ? 1 : 0.3 + opacity * 0.7 }}
                            >
                                <div className="text-xl mb-1">{op.icon}</div>
                                <div className="text-xs font-medium text-white">{op.name}</div>
                                <div className="text-xs text-slate-500 mt-1">{op.params}M params</div>
                                {score > 0 && (
                                    <div className="mt-1.5 h-1 rounded bg-slate-700 overflow-hidden">
                                        <div
                                            className="h-full rounded bg-gradient-to-r from-cyan-500 to-violet-500 transition-all"
                                            style={{ width: `${score * 100}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Best Architecture Visualization */}
            {bestArch && (
                <div className="card space-y-4">
                    <div className="section-label">Discovered Architecture</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Total Params', value: `${bestArch.totalParams}M`, color: 'text-cyan-400' },
                            { label: 'Est. FLOPs', value: `${bestArch.totalFlops}G`, color: 'text-violet-400' },
                            { label: 'Cells Stacked', value: bestArch.numCells, color: 'text-emerald-400' },
                            { label: 'Test Error', value: currentAccuracy ? `${(100 - currentAccuracy).toFixed(2)}%` : 'N/A', color: 'text-orange-400' }
                        ].map((m) => (
                            <div key={m.label} className="card bg-slate-900/60 p-3 text-center">
                                <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
                                <div className="text-xs text-slate-500 mt-1">{m.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Normal Cell diagram */}
                    <div>
                        <div className="text-xs text-slate-400 mb-3">Normal Cell (top-4 operations):</div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="rounded border border-slate-600 px-3 py-1.5 bg-slate-900 text-xs text-slate-400">Input</div>
                            <span className="text-slate-600">→</span>
                            {bestArch.normalCellOps.map((op, i) => (
                                <React.Fragment key={op.id}>
                                    <div className="rounded border border-cyan-700/60 px-3 py-1.5 bg-cyan-900/20 text-xs text-cyan-300">
                                        {op.icon} {op.name}
                                    </div>
                                    {i < bestArch.normalCellOps.length - 1 && <span className="text-slate-600">+</span>}
                                </React.Fragment>
                            ))}
                            <span className="text-slate-600">→</span>
                            <div className="rounded border border-slate-600 px-3 py-1.5 bg-slate-900 text-xs text-slate-400">Output</div>
                        </div>
                    </div>

                    {/* Stacked architecture */}
                    <div>
                        <div className="text-xs text-slate-400 mb-3">Full Network (stacked cells pattern):</div>
                        <div className="flex items-center gap-1 flex-wrap text-xs">
                            <span className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400">Stem Conv</span>
                            <span className="text-slate-600">→</span>
                            {Array.from({ length: bestArch.numCells }, (_, i) => (
                                <React.Fragment key={i}>
                                    <span className={`px-2 py-1 rounded border text-xs ${i === Math.floor(bestArch.numCells / 2) ? 'bg-orange-900/30 border-orange-700/60 text-orange-300' : 'bg-cyan-900/20 border-cyan-700/40 text-cyan-300'}`}>
                                        {i === Math.floor(bestArch.numCells / 2) ? '↓ Reduction Cell' : 'Normal Cell'}
                                    </span>
                                    {i < bestArch.numCells - 1 && <span className="text-slate-600">→</span>}
                                </React.Fragment>
                            ))}
                            <span className="text-slate-600">→</span>
                            <span className="px-2 py-1 rounded bg-emerald-900/20 border border-emerald-700/40 text-emerald-300">Output</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-2">{bestArch.description}</div>
                    </div>
                </div>
            )}

            {/* Search History Table & Chart */}
            {history.length > 0 && (
                <div className="space-y-6">
                    <div className="card">
                        <div className="section-label">Search History</div>
                        <div className="overflow-x-auto rounded border border-slate-700">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Iter</th>
                                        <th>Architecture ID</th>
                                        <th>Val. Accuracy (%)</th>
                                        <th>Search Cost (GPU-hrs)</th>
                                        <th>Params (M)</th>
                                        <th>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((r) => (
                                        <tr key={r.iteration}>
                                            <td className="font-mono">{r.iteration}</td>
                                            <td className="font-mono text-xs text-violet-400">{r.architectureId}</td>
                                            <td className={r.validationAccuracy > 96 ? 'text-emerald-400 font-semibold' : ''}>{r.validationAccuracy.toFixed(2)}</td>
                                            <td>{r.searchCost.toFixed(3)}</td>
                                            <td>{r.params.toFixed(2)}</td>
                                            <td className="text-xs text-slate-400">{r.description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {chartData && (
                            <div className="card">
                                <div className="text-xs text-slate-400 mb-3">Accuracy vs Search Iteration</div>
                                <div style={{ height: 220 }}>
                                    <Line data={chartData} options={{ ...LINE_OPTS, maintainAspectRatio: false }} />
                                </div>
                            </div>
                        )}
                        {costData && (
                            <div className="card">
                                <div className="text-xs text-slate-400 mb-3">Cumulative Search Cost</div>
                                <div style={{ height: 220 }}>
                                    <Line data={costData} options={{ ...LINE_OPTS, maintainAspectRatio: false }} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Performance Metrics */}
            {bestArch && !isSearching && (
                <div className="card">
                    <div className="section-label">Final Architecture Performance Metrics</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                            { label: 'Test Error Rate', value: currentAccuracy ? `${(100 - currentAccuracy).toFixed(2)}%` : '2.85%', desc: 'CIFAR-10 benchmark', color: 'text-cyan-400' },
                            { label: 'Search Cost', value: history[history.length - 1] ? `${history[history.length - 1].searchCost.toFixed(2)} GPU-hrs` : '0.40 GPU-days', desc: 'Total compute', color: 'text-violet-400' },
                            { label: 'Parameters', value: `${bestArch.totalParams}M`, desc: 'Model size', color: 'text-emerald-400' },
                            { label: 'FLOPs', value: `${bestArch.totalFlops}G`, desc: 'Inference cost', color: 'text-orange-400' }
                        ].map((m) => (
                            <div key={m.label} className="card bg-slate-900/60 p-4">
                                <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
                                <div className="text-sm text-white mt-1">{m.label}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{m.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
