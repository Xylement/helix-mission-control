"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";

type EventCallback = (data: Record<string, unknown>) => void;

interface WebSocketContextValue {
  isConnected: boolean;
  isReconnecting: boolean;
  subscribe: (eventType: string, callback: EventCallback) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  isConnected: false,
  isReconnecting: false,
  subscribe: () => () => {},
});

export function WebSocketProvider({
  children,
  token,
}: {
  children: ReactNode;
  token: string | null;
}) {
  const ws = useWebSocket(token);
  return (
    <WebSocketContext.Provider value={ws}>{children}</WebSocketContext.Provider>
  );
}

export const useWS = () => useContext(WebSocketContext);
