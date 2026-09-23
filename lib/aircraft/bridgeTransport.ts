import { parseFlightBridgeMessage, type FlightBridgeMessage } from "@/lib/aircraft/bridgeProtocol";

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


type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: Event | MessageEvent) => void): void;
  removeEventListener(type: "open" | "message" | "close" | "error", listener: (event: Event | MessageEvent) => void): void;
};

type WebSocketFactory = (url: string) => WebSocketLike;

export class WebSocketFlightBridgeTransport implements FlightBridgeTransport {
  private listeners = new Set<(message: FlightBridgeMessage) => void>();
  private socket: WebSocketLike | null = null;
  private readonly factory: WebSocketFactory;
  connected = false;

  constructor(
    private readonly url: string,
    factory?: WebSocketFactory,
    private readonly connectTimeoutMs = 5000,
  ) {
    this.factory =
      factory ??
      ((target) => {
        if (typeof WebSocket === "undefined") {
          throw new Error("WebSocket is not available in this environment.");
        }
        return new WebSocket(target);
      });
  }

  async connect() {
    if (this.connected) return;
    if (this.socket) throw new Error("Flight Bridge WebSocket is already connecting.");

    const socket = this.factory(this.url);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        clearTimeout(timer);
      };
      const onOpen = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.connected = true;
        resolve();
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.socket = null;
        reject(new Error("Unable to connect to DOMINIC Flight Bridge."));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          socket.close(4000, "DOMINIC connection timeout");
        } catch {}
        this.socket = null;
        reject(new Error(`Flight Bridge connection timed out after ${this.connectTimeoutMs} ms.`));
      }, this.connectTimeoutMs);

      socket.addEventListener("open", onOpen);
      socket.addEventListener("error", onError);
    });

    socket.addEventListener("message", this.onMessage);
    socket.addEventListener("close", this.onClose);
  }

  async disconnect() {
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    if (!socket) return;
    socket.removeEventListener("message", this.onMessage);
    socket.removeEventListener("close", this.onClose);
    try {
      socket.close(1000, "DOMINIC disconnect");
    } catch {}
  }

  async send(message: FlightBridgeMessage) {
    if (!this.connected || !this.socket) {
      throw new Error("Flight Bridge transport is not connected.");
    }
    this.socket.send(JSON.stringify(message));
  }

  subscribe(listener: (message: FlightBridgeMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private onMessage = (event: Event | MessageEvent) => {
    if (!(event instanceof MessageEvent) || typeof event.data !== "string") return;
    try {
      const message = parseFlightBridgeMessage(event.data);
      for (const listener of this.listeners) listener(message);
    } catch {
      // Ignore malformed/non-DOMINIC traffic at the transport boundary.
    }
  };

  private onClose = () => {
    this.connected = false;
  };
}
