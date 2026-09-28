import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL, {
      withCredentials: true,
      autoConnect: true,
    });
  }
  return socket;
}

export function useSocket(): Socket {
  const socketRef = useRef<Socket>(getSocket());

  useEffect(() => {
    const s = socketRef.current;
    if (!s.connected) {
      s.connect();
    }
    return () => {
      // Intentionally do not disconnect: the socket is a module-level singleton
      // and may be used by other components.
    };
  }, []);

  return socketRef.current;
}
