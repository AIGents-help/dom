import {
  DOMINIC_BRIDGE_PROTOCOL,
  parseFlightBridgeMessage,
  type BridgeError,
  type FlightBridgeMessage,
} from "@/lib/aircraft/bridgeProtocol";
import { FlightBridgeServerSession } from "@/lib/aircraft/bridgeServer";

export interface BridgeTextSocket {
  readonly connected: boolean;
  sendText(data: string): Promise<void> | void;
  subscribeText(listener: (data: string) => void): () => void;
  subscribeClose?(listener: () => void): () => void;
  close?(code?: number, reason?: string): Promise<void> | void;
}

export class FlightBridgeWireHost {
  private unsubscribeSession?: () => void;
  private unsubscribeSocket?: () => void;
  private unsubscribeClose?: () => void;
  private started = false;
  private stopping = false;

  constructor(
    private readonly session: FlightBridgeServerSession,
    private readonly socket: BridgeTextSocket,
  ) {}

  async start() {
    if (this.started) return;
    if (!this.socket.connected) {
      throw new Error("Flight Bridge wire socket is not connected.");
    }

    this.started = true;
    this.unsubscribeSession = this.session.subscribe((message) => {
      void this.send(message);
    });

    this.unsubscribeSocket = this.socket.subscribeText((raw) => {
      void this.receive(raw);
    });

    this.unsubscribeClose = this.socket.subscribeClose?.(() => {
      void this.stop(false);
    });

    try {
      await this.session.start();
    } catch (error) {
      await this.stop(false);
      throw error;
    }
  }

  async stop(closeSocket = true) {
    if ((!this.started && !this.stopping) || this.stopping) return;
    this.stopping = true;
    this.started = false;

    this.unsubscribeSession?.();
    this.unsubscribeSession = undefined;
    this.unsubscribeSocket?.();
    this.unsubscribeSocket = undefined;
    this.unsubscribeClose?.();
    this.unsubscribeClose = undefined;

    try {
      await this.session.stop();
    } finally {
      if (closeSocket) {
        await this.socket.close?.(1000, "DOMINIC Flight Bridge stopped");
      }
      this.stopping = false;
    }
  }

  private async receive(raw: string) {
    if (!this.started) return;

    let message: FlightBridgeMessage;
    try {
      message = parseFlightBridgeMessage(raw);
    } catch (error) {
      const response: BridgeError = {
        type: "error",
        protocol: DOMINIC_BRIDGE_PROTOCOL,
        code: "invalid_message",
        message:
          error instanceof Error
            ? error.message
            : "Invalid DOMINIC Flight Bridge message.",
      };
      await this.send(response);
      return;
    }

    await this.session.receive(message);
  }

  private async send(message: FlightBridgeMessage) {
    if (!this.socket.connected) return;
    await this.socket.sendText(JSON.stringify(message));
  }
}
