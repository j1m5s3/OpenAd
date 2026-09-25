/** Demo mode flag (ADR-0016). Static string compare so Rollup can dead-code-eliminate
 * the `demo/` chunk out of normal builds when the env var is unset. */
export const DEMO_MODE: boolean = import.meta.env.VITE_DEMO_MODE === '1';
