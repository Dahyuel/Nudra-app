import type { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function setIO(io: Server): void {
  ioInstance = io;
}

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized');
  }
  return ioInstance;
}

export function disconnectUser(userId: string): void {
  ioInstance?.in(`user:${userId}`).disconnectSockets(true);
}

export function disconnectSession(sessionId: string): void {
  ioInstance?.in(`session:${sessionId}`).disconnectSockets(true);
}
