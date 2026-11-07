import http from 'http';
import https from 'https';

export interface KeepAliveStatus {
  status: 'alive' | 'sleeping';
  service: string;
  uptimeSeconds: number;
  timestamp: string;
  host: string;
  environment: string;
  lastPingReceivedAt: string;
  heartbeatActive: boolean;
}

let lastPingTimestamp = new Date().toISOString();
let heartbeatIntervalTimer: NodeJS.Timeout | null = null;

/**
 * SECTION 4.1: Fast, lightweight self-ping endpoint payload.
 * Responds in <5ms with 200 OK to keep the Render Web Service container active.
 */
export function getKeepAlivePayload(): KeepAliveStatus {
  lastPingTimestamp = new Date().toISOString();
  return {
    status: 'alive',
    service: 'autochat-commerce-render-gateway',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    host: process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000',
    environment: process.env.NODE_ENV || 'production',
    lastPingReceivedAt: lastPingTimestamp,
    heartbeatActive: heartbeatIntervalTimer !== null
  };
}

/**
 * SECTION 4.2: Automated Anti-Sleep Heartbeat Loop.
 * Periodically issues an HTTP/HTTPS GET request to prevent Render's free tier
 * from entering 15-minute inactivity hibernation.
 */
export function startRenderAutoHeartbeat(intervalMinutes = 10): void {
  if (heartbeatIntervalTimer) {
    clearInterval(heartbeatIntervalTimer);
  }

  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  console.log(`[RenderKeepAlive] Initialized auto-heartbeat loop (Interval: ${intervalMinutes} minutes)...`);

  heartbeatIntervalTimer = setInterval(() => {
    const targetUrl = 
      process.env.RENDER_EXTERNAL_URL 
        ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')}/api/v1/keep-alive`
        : `http://localhost:${process.env.PORT || 3000}/api/v1/keep-alive`;

    try {
      const client = targetUrl.startsWith('https://') ? https : http;
      const req = client.get(targetUrl, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          lastPingTimestamp = new Date().toISOString();
          console.log(`[RenderKeepAlive] Heartbeat ping executed (${res.statusCode} OK). Render hibernation averted.`);
        });
      });

      req.on('error', (err) => {
        console.warn(`[RenderKeepAlive] Heartbeat self-ping note: ${err.message}`);
      });

      req.setTimeout(8000, () => {
        req.destroy();
      });
    } catch (err: any) {
      console.warn(`[RenderKeepAlive] Heartbeat dispatch note: ${err.message}`);
    }
  }, intervalMs);
}

export function stopRenderAutoHeartbeat(): void {
  if (heartbeatIntervalTimer) {
    clearInterval(heartbeatIntervalTimer);
    heartbeatIntervalTimer = null;
    console.log('[RenderKeepAlive] Stopped auto-heartbeat loop.');
  }
}
