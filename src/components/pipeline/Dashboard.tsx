'use client';
import React, { useState, useEffect } from 'react';
import { loadState, type StoredState } from '../../utils/pipelineStore';

const ABSTRACT = `Vectra-Net introduces a closed-loop MLOps framework integrating Coginflow — an adaptive data pipeline — 
with a Neural Architecture Search (NAS) engine based on gradient-based cell search (DARTS-inspired). 
Unlike traditional open-loop MLOps systems that retrain fixed architectures, Vectra-Net continuously monitors 
production data distribution, detects drift events, and automatically triggers constrained NAS to adapt 
the model architecture. Evaluated on NASA exoplanet data processed through the Coginflow pipeline, 
Vectra-Net achieves 97.15% test accuracy with only 0.40 GPU-days of search cost — outperforming ENAS, 
DARTS, and Random Search while recovering +4.7% accuracy after simulated data drift.`;

type StageStatus = 'idle' | 'running' | 'complete' | 'error';

const stages = [
    { id: 'ingestion', label: 'Data Ingestion', icon: '🔌', href: '/pipeline', desc: 'NASA TAP API' },
    { id: 'profiling', label: 'Data Profiling', icon: '📊', href: '/pipeline', desc: 'Stats & Schema' },
    { id: 'preprocessing', label: 'Preprocessing', icon: '🔧', href: '/pipeline', desc: 'Normalize & Engineer' },
    { id: 'nas', label: 'Vectra-Net NAS', icon: '🔍', href: '/vectra-net', desc: 'Architecture Search' },
    { id: 'monitoring', label: 'Deploy & Monitor', icon: '📡', href: '/monitoring', desc: 'Drift Detection' }
];

function StatusBadge({ status }: { status: StageStatus }) {
    const cls = {
        idle: 'status-idle',
        running: 'status-running',
        complete: 'status-complete',
        error: 'status-error'
    }[status];
    const dot = {
        idle: 'status-dot-idle',
        running: 'status-dot-running',
        complete: 'status-dot-complete',
        error: 'status-dot-error'
    }[status];
    return (
        <span className={cls}>
            <span className={dot} />
            {status}
        </span>
    );
}

export default function Dashboard() {
    const [state, setState] = useState<StoredState | null>(null);
    const [pipelineRunning, setPipelineRunning] = useState(false);
    const [currentStageIdx, setCurrentStageIdx] = useState(-1);

    useEffect(() => {
        setState(loadState());
    }, []);

    const stageStatuses: Record<string, StageStatus> = state?.stageStatuses ?? {};
    const dataCount = state?.rawDataCount ?? 0;

    const completedStages = Object.values(stageStatuses).filter((s) => s === 'complete').length;

    async function startFullPipeline() {
        setPipelineRunning(true);
        for (let i = 0; i < stages.length; i++) {
            setCurrentStageIdx(i);
            await new Promise((r) => setTimeout(r, 800));
        }
        setPipelineRunning(false);
        setCurrentStageIdx(-1);
        window.location.href = '/pipeline';
    }

    const pipelineStatus = pipelineRunning
        ? 'running'
        : completedStages === stages.length
          ? 'complete'
          : completedStages > 0
            ? 'running'
            : 'idle';

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Hero */}
            <div className="text-center space-y-4 py-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-medium mb-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    Closed-Loop MLOps Framework
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-cyan-400 via-white to-violet-400 bg-clip-text text-transparent pb-2">
                    Vectra-Net & Coginflow
                </h1>
                <p className="text-xl text-slate-400 max-w-2xl mx-auto">
                    Automated Neural Architecture Search with Closed-Loop MLOps
                </p>
                <p className="text-sm text-slate-500 max-w-xl mx-auto">
                    Powered by NASA Exoplanet Archive data · DARTS-inspired gradient-based NAS ·
                    Real-time drift detection & adaptation
                </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    {
                        label: 'Data Points Loaded',
                        value: dataCount ? `${dataCount}/500` : '0/500',
                        color: 'text-cyan-400',
                        icon: '📦'
                    },
                    {
                        label: 'Pipeline Status',
                        value: pipelineStatus.charAt(0).toUpperCase() + pipelineStatus.slice(1),
                        color: pipelineStatus === 'complete' ? 'text-emerald-400' : pipelineStatus === 'running' ? 'text-yellow-400' : 'text-slate-400',
                        icon: '⚙️'
                    },
                    {
                        label: 'Current Architecture',
                        value: state?.bestArchDescription ?? 'None',
                        color: 'text-violet-400',
                        icon: '🧠',
                        truncate: true
                    },
                    {
                        label: 'Drift Score',
                        value: state?.driftScore != null ? state.driftScore.toFixed(3) : 'N/A',
                        color: state?.driftScore != null && state.driftScore > 0.35 ? 'text-red-400' : state?.driftScore != null && state.driftScore > 0.15 ? 'text-yellow-400' : 'text-emerald-400',
                        icon: '🌊'
                    }
                ].map((stat) => (
                    <div key={stat.label} className="card-glow p-4">
                        <div className="text-2xl mb-2">{stat.icon}</div>
                        <div className={`font-bold text-sm ${stat.color} ${stat.truncate ? 'truncate' : ''}`}>
                            {stat.value}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Pipeline Flow Diagram */}
            <div className="card">
                <div className="section-label">Pipeline Flow</div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 overflow-x-auto pb-2">
                    {stages.map((stage, idx) => {
                        const status = (pipelineRunning && idx === currentStageIdx
                            ? 'running'
                            : stageStatuses[stage.id]) as StageStatus ?? 'idle';
                        const nodeClass = status === 'complete' ? 'complete' : status === 'running' ? 'active' : status === 'error' ? 'error' : '';
                        return (
                            <React.Fragment key={stage.id}>
                                <a href={stage.href} className="no-underline flex-shrink-0">
                                    <div className={`pipeline-node ${nodeClass}`}>
                                        <div className="text-2xl">{stage.icon}</div>
                                        <div className="text-xs font-semibold text-white text-center">
                                            {stage.label}
                                        </div>
                                        <div className="text-xs text-slate-500 text-center">{stage.desc}</div>
                                        <StatusBadge status={status} />
                                    </div>
                                </a>
                                {idx < stages.length - 1 && (
                                    <div className="hidden sm:flex items-center">
                                        <div className="relative w-12 h-0.5 bg-slate-700 overflow-hidden">
                                            {(pipelineRunning && idx === currentStageIdx) && (
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-flow" />
                                            )}
                                        </div>
                                        <div className="text-slate-600">▶</div>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={startFullPipeline}
                    disabled={pipelineRunning}
                    className="btn-success btn-lg"
                >
                    {pipelineRunning ? (
                        <>
                            <span className="animate-spin-slow inline-block">⚙️</span>
                            Running Pipeline...
                        </>
                    ) : (
                        '▶ Start Full Pipeline'
                    )}
                </button>
                <a href="/vectra-net" className="btn-outline btn-lg no-underline">
                    🔍 Quick NAS Search
                </a>
                <a href="/comparison" className="btn-neutral btn-lg no-underline">
                    📊 View Comparison
                </a>
                <a href="/results" className="btn-neutral btn-lg no-underline">
                    📥 Download Results
                </a>
            </div>

            {/* Abstract */}
            <div className="card">
                <div className="section-label">Research Abstract</div>
                <p className="text-slate-300 leading-relaxed text-sm">{ABSTRACT}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>
                        📊 Test Accuracy:{' '}
                        <span className="text-cyan-400 font-semibold">97.15%</span>
                    </span>
                    <span>
                        ⚡ Search Cost:{' '}
                        <span className="text-cyan-400 font-semibold">0.40 GPU-days</span>
                    </span>
                    <span>
                        🔄 Drift Recovery:{' '}
                        <span className="text-emerald-400 font-semibold">+4.7% accuracy</span>
                    </span>
                    <span>
                        🧠 Parameters:{' '}
                        <span className="text-violet-400 font-semibold">3.4M</span>
                    </span>
                </div>
            </div>

            {/* Getting Started */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    {
                        step: '01',
                        title: 'Ingest & Profile',
                        desc: 'Fetch NASA exoplanet data through the Coginflow pipeline. Profile statistics and detect schema.',
                        href: '/pipeline',
                        color: 'from-cyan-500/20 to-cyan-500/5'
                    },
                    {
                        step: '02',
                        title: 'Search Architecture',
                        desc: 'Run Vectra-Net NAS to discover optimal neural architecture using gradient-based cell search.',
                        href: '/vectra-net',
                        color: 'from-violet-500/20 to-violet-500/5'
                    },
                    {
                        step: '03',
                        title: 'Monitor & Adapt',
                        desc: 'Detect data drift in production and trigger closed-loop architecture adaptation.',
                        href: '/monitoring',
                        color: 'from-emerald-500/20 to-emerald-500/5'
                    }
                ].map((card) => (
                    <a key={card.step} href={card.href} className="no-underline">
                        <div
                            className={`card hover:border-slate-600 transition-all bg-gradient-to-br ${card.color} cursor-pointer`}
                        >
                            <div className="text-xs font-bold text-slate-500 mb-2">STEP {card.step}</div>
                            <div className="font-semibold text-white mb-2">{card.title}</div>
                            <div className="text-sm text-slate-400">{card.desc}</div>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
