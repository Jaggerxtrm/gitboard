export type WsMessage = {
  type: string;
  channel?: string;
  event?: string;
  data?: unknown;
  id?: string;
};

export type WsHandler = (msg: WsMessage) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private subscriptions = new Set<string>();
  private handlers: WsHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private closed = false;

  constructor(private url: string) {}

  connect(): void {
    if (this.ws) return;
    this.closed = false;
    this._open();
  }

  private _open(): void {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      // Re-subscribe all channels
      for (const channel of this.subscriptions) {
        this._send({ type: "subscribe", channel });
      }
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as WsMessage;
        for (const h of this.handlers) h(msg);
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.closed) this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private _scheduleReconnect(): void {
    if (this.closed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this._open();
    }, this.reconnectDelay);
  }

  private _send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(channel: string): void {
    this.subscriptions.add(channel);
    this._send({ type: "subscribe", channel });
  }

  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
    this._send({ type: "unsubscribe", channel });
  }

  onMessage(handler: WsHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
}

export function buildWsUrl(baseUrl = ""): string {
  const base = baseUrl || window.location.origin;
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  return url.toString();
}
