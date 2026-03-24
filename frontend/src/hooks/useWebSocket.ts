"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type EventCallback = (data: Record<string, unknown>) => void;

interface UseWebSocketReturn {
  isConnected: boolean;
  isReconnecting: boolean;
  subscribe: (eventType: string, callback: EventCallback) => () => void;
}

function getWsUrl(): string {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${host}/ws`;
}

export function useWebSocket(token: string | null): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef<Map<string, Set<EventCallback>>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const subscribe = useCallback((eventType: string, callback: EventCallback) => {
    if (!subscribersRef.current.has(eventType)) {
      subscribersRef.current.set(eventType, new Set());
    }
    subscribersRef.current.get(eventType)!.add(callback);

    return () => {
      subscribersRef.current.get(eventType)?.delete(callback);
    };
  }, []);

  const connect = useCallback(() => {
    if (!token || typeof window === "undefined") return;

    const wsUrl = `${getWsUrl()}?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setIsReconnecting(false);
      backoffRef.current = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type as string;
        if (!eventType) return;

        // Notify subscribers for this event type
        subscribersRef.current.get(eventType)?.forEach((cb) => cb(data));

        // Also notify wildcard subscribers
        subscribersRef.current.get("*")?.forEach((cb) => cb(data));
      } catch {
        // ignore non-JSON messages (like "pong")
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);

      // Auto-reconnect with exponential backoff
      setIsReconnecting(true);
      const delay = Math.min(backoffRef.current, 30000);
      backoffRef.current = Math.min(backoffRef.current * 2, 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    wsRef.current = ws;
  }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    // Keep-alive ping every 30s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 30000);

    return () => {
      mountedRef.current = false;
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, isReconnecting, subscribe };
}
