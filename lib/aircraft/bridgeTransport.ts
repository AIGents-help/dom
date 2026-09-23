import type { FlightBridgeMessage } from "@/lib/aircraft/bridgeProtocol";

export interface FlightBridgeTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: FlightBridgeMessage): Promise<void>;
  subscribe(listener: (message: FlightBridgeMessage) => void): () => void;
  readonly connected: boolean;
}

export class LoopbackFlightBridgeTransport implements FlightBridgeTransport {
  private listeners = new Set<(message: FlightBridgeMessage) => void>();
  connected = false;

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  async send(message: FlightBridgeMessage) {
    if (!this.connected) throw new Error("Flight Bridge transport is not connected.");
    queueMicrotask(() => {
      for (const listener of this.listeners) listener(message);
    });
  }

  subscribe(listener: (message: FlightBridgeMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
