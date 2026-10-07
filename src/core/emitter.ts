export type Listener<P> = (payload: P) => void;

/** Minimal typed event emitter. Listeners run synchronously in subscription order. */
export class Emitter<Events extends object> {
    private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

    on<K extends keyof Events>(
        event: K,
        listener: Listener<Events[K]>
    ): () => void {
        const existing = this.listeners.get(event);
        const set = existing ?? new Set<Listener<never>>();
        if (!existing) {
            this.listeners.set(event, set);
        }
        set.add(listener as Listener<never>);
        return () => {
            set.delete(listener as Listener<never>);
        };
    }

    emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        const set = this.listeners.get(event);
        if (!set) {
            return;
        }
        for (const listener of [...set]) {
            (listener as Listener<Events[K]>)(payload);
        }
    }
}
