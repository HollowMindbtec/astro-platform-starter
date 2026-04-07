// localStorage-based pipeline state persistence

const STORE_KEY = 'vectranet_pipeline_state';

export interface StoredState {
    rawDataCount: number | null;
    rawDataSource: 'api' | 'fallback' | null;
    profiledAt: number | null;
    processedAt: number | null;
    nasSearchDone: boolean;
    bestArchDescription: string | null;
    bestArchAccuracy: number | null;
    driftScore: number | null;
    isMonitoring: boolean;
    logs: string[];
    stageStatuses: Record<string, 'idle' | 'running' | 'complete' | 'error'>;
}

const DEFAULT_STATE: StoredState = {
    rawDataCount: null,
    rawDataSource: null,
    profiledAt: null,
    processedAt: null,
    nasSearchDone: false,
    bestArchDescription: null,
    bestArchAccuracy: null,
    driftScore: null,
    isMonitoring: false,
    logs: [],
    stageStatuses: {
        ingestion: 'idle',
        profiling: 'idle',
        preprocessing: 'idle',
        nas: 'idle',
        monitoring: 'idle'
    }
};

export function loadState(): StoredState {
    if (typeof window === 'undefined') return DEFAULT_STATE;
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return { ...DEFAULT_STATE };
        return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_STATE };
    }
}

export function saveState(state: Partial<StoredState>): void {
    if (typeof window === 'undefined') return;
    try {
        const current = loadState();
        const merged = { ...current, ...state };
        // Limit logs to last 200 entries
        if (merged.logs.length > 200) {
            merged.logs = merged.logs.slice(-200);
        }
        localStorage.setItem(STORE_KEY, JSON.stringify(merged));
    } catch {
        // Ignore storage errors
    }
}

export function clearState(): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(STORE_KEY);
    } catch {
        // Ignore
    }
}

export function addLog(message: string, stage?: string): void {
    const state = loadState();
    const timestamp = new Date().toISOString().substring(11, 19);
    state.logs.push(`[${timestamp}] ${stage ? `[${stage.toUpperCase()}] ` : ''}${message}`);
    saveState({ logs: state.logs });
}
