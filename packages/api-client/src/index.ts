// @xtrm/api-client
// REST and WebSocket client for xtrm services

// Placeholder exports - will be implemented
export class ApiClient {
  constructor(private baseUrl: string) {}
  
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  }
  
  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  }
}

export class WsClient {
  constructor(private url: string) {}
  
  connect(): void {
    // Will implement
  }
  
  subscribe(channel: string, callback: (data: unknown) => void): void {
    // Will implement
  }
  
  close(): void {
    // Will implement
  }
}