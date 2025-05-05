// --- Settings ---
export interface PrologServerSettings {
    blint: {
        // Path can be explicitly set or null (use bundled)
        path: string | null;
        args?: string[];
    };
}

export const defaultSettings: PrologServerSettings = {
    blint: {
        path: null // Explicit default
    }
};
