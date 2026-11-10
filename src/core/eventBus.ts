type Listener<T> = (payload: T) => void;

/**
 * Маленькая типизированная шина событий.
 * Не знает о Game, Three.js и DOM — только доставляет payload подписчикам.
 */
export class EventBus<TEvents extends object> {
  private readonly listeners = new Map<keyof TEvents, Set<Listener<never>>>();

  on<K extends keyof TEvents>(type: K, listener: Listener<TEvents[K]>): () => void {
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add(listener as Listener<never>);
    return () => this.off(type, listener);
  }

  once<K extends keyof TEvents>(type: K, listener: Listener<TEvents[K]>): () => void {
    const wrapped: Listener<TEvents[K]> = (payload) => {
      this.off(type, wrapped);
      listener(payload);
    };
    return this.on(type, wrapped);
  }

  off<K extends keyof TEvents>(type: K, listener: Listener<TEvents[K]>): void {
    this.listeners.get(type)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof TEvents>(type: K, payload: TEvents[K]): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      (listener as Listener<TEvents[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  listenerCount<K extends keyof TEvents>(type: K): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}
