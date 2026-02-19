export type QuotaLoopHandle = Readonly<{
    stop: () => void;
}>;

export function startQuotaLoop(params: Readonly<{
    tickMs: number;
    coordinator: Readonly<{ tickOnce: () => Promise<void> }>;
    onTickError: (error: unknown) => void;
}>): QuotaLoopHandle {
    const tickMs = Math.max(1, Math.trunc(params.tickMs));

    let stopped = false;
    let inFlight = false;
    const intervalHandle = setInterval(() => {
        if (stopped || inFlight) return;
        inFlight = true;
        void (async () => {
            try {
                await params.coordinator.tickOnce();
            } catch (error) {
                params.onTickError(error);
            } finally {
                inFlight = false;
            }
        })();
    }, tickMs);
    (intervalHandle as unknown as { unref?: () => void })?.unref?.();

    return {
        stop: () => {
            if (stopped) return;
            stopped = true;
            clearInterval(intervalHandle);
        },
    };
}
