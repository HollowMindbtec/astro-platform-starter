// Vectra-Net Neural Architecture Search Simulator

export type Operation =
    | '3x3 Conv'
    | '5x5 Conv'
    | '3x3 Dilated Conv'
    | '3x3 Sep Conv'
    | '5x5 Sep Conv'
    | 'Max Pool 3x3'
    | 'Avg Pool 3x3'
    | 'Skip Connect'
    | 'Zero';

export interface CellOperation {
    id: string;
    name: Operation;
    icon: string;
    params: number; // millions
    flops: number; // GFLOPs
    score: number; // learned weight (0-1)
}

export interface Architecture {
    id: string;
    normalCellOps: CellOperation[];
    reductionCellOps: CellOperation[];
    numCells: number;
    totalParams: number;
    totalFlops: number;
    description: string;
}

export interface NASResult {
    iteration: number;
    architectureId: string;
    validationAccuracy: number;
    searchCost: number; // GPU-hours
    description: string;
    params: number;
}

export const CELL_OPERATIONS: CellOperation[] = [
    { id: 'conv3x3', name: '3x3 Conv', icon: '⬜', params: 0.14, flops: 0.37, score: 0 },
    { id: 'conv5x5', name: '5x5 Conv', icon: '🟦', params: 0.38, flops: 1.0, score: 0 },
    { id: 'dil3x3', name: '3x3 Dilated Conv', icon: '🔷', params: 0.14, flops: 0.37, score: 0 },
    { id: 'sep3x3', name: '3x3 Sep Conv', icon: '🟩', params: 0.04, flops: 0.06, score: 0 },
    { id: 'sep5x5', name: '5x5 Sep Conv', icon: '🟪', params: 0.1, flops: 0.16, score: 0 },
    { id: 'maxpool', name: 'Max Pool 3x3', icon: '⬛', params: 0, flops: 0.02, score: 0 },
    { id: 'avgpool', name: 'Avg Pool 3x3', icon: '🔲', params: 0, flops: 0.02, score: 0 },
    { id: 'skip', name: 'Skip Connect', icon: '➡️', params: 0, flops: 0, score: 0 },
    { id: 'zero', name: 'Zero', icon: '✖️', params: 0, flops: 0, score: 0 }
];

// Simulate DARTS-style gradient-based search
export function simulateNASStep(
    currentScores: Record<string, number>,
    iteration: number,
    numCells: number,
    lr: number
): { scores: Record<string, number>; accuracy: number; cost: number } {
    const newScores = { ...currentScores };

    // Simulate gradient updates — prefer sep convs and dilated convs
    const targetWeights: Record<string, number> = {
        conv3x3: 0.65,
        conv5x5: 0.45,
        dil3x3: 0.82,
        sep3x3: 0.88,
        sep5x5: 0.78,
        maxpool: 0.4,
        avgpool: 0.35,
        skip: 0.6,
        zero: 0.1
    };

    // Add some noise and gradient-like updates
    for (const op of Object.keys(targetWeights)) {
        const current = newScores[op] ?? Math.random() * 0.5;
        const target = targetWeights[op];
        const noise = (Math.random() - 0.5) * 0.08;
        newScores[op] = Math.max(0, Math.min(1, current + lr * (target - current) + noise));
    }

    // Accuracy improves with iterations, Vectra-Net converges to ~97.15%
    const baseAccuracy = 95.0;
    const convergenceRate = 1 - Math.exp(-iteration / 30);
    const accuracy = baseAccuracy + 2.15 * convergenceRate + (Math.random() - 0.5) * 0.2;

    // Cost per iteration (GPU-hours)
    const cost = (numCells * 0.002 * (1 + Math.random() * 0.1)) / lr;

    return { scores: newScores, accuracy: +accuracy.toFixed(2), cost: +cost.toFixed(4) };
}

export function buildArchitecture(
    scores: Record<string, number>,
    numCells: number,
    searchEpochs: number
): Architecture {
    // Select top-scoring operations
    const sortedOps = CELL_OPERATIONS.map((op) => ({
        ...op,
        score: scores[op.id] ?? Math.random()
    })).sort((a, b) => b.score - a.score);

    const normalCellOps = sortedOps.slice(0, 4);
    const reductionCellOps = [
        sortedOps.find((o) => o.name === 'Max Pool 3x3') ?? sortedOps[5],
        sortedOps.find((o) => o.name === '3x3 Dilated Conv') ?? sortedOps[2]
    ];

    const totalParams =
        normalCellOps.reduce((s, op) => s + op.params, 0) * numCells +
        reductionCellOps.reduce((s, op) => s + op.params, 0) * 2;

    const totalFlops =
        normalCellOps.reduce((s, op) => s + op.flops, 0) * numCells +
        reductionCellOps.reduce((s, op) => s + op.flops, 0) * 2;

    const topOp = normalCellOps[0]?.name ?? 'Sep Conv';

    return {
        id: `arch-${searchEpochs}-${numCells}`,
        normalCellOps,
        reductionCellOps,
        numCells,
        totalParams: +(totalParams + 0.8).toFixed(2),
        totalFlops: +(totalFlops + 0.5).toFixed(2),
        description: `${numCells} cells stacked, preferred op: ${topOp}`
    };
}

export function generateSearchHistory(totalIterations: number, lr: number, numCells: number): NASResult[] {
    const results: NASResult[] = [];
    let scores: Record<string, number> = {};
    let cumCost = 0;

    for (let i = 1; i <= totalIterations; i++) {
        const step = simulateNASStep(scores, i, numCells, lr);
        scores = step.scores;
        cumCost += step.cost;

        if (i % 5 === 0 || i === 1 || i === totalIterations) {
            const arch = buildArchitecture(scores, numCells, i);
            results.push({
                iteration: i,
                architectureId: arch.id,
                validationAccuracy: step.accuracy,
                searchCost: +cumCost.toFixed(3),
                description: arch.description,
                params: arch.totalParams
            });
        }
    }
    return results;
}
