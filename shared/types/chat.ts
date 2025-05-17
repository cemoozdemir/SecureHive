export interface ServerToClientEvents {
  message: (data: {
    sender: string;
    ciphertext: number[];
    iv: number[];
    timestamp: string;
    expiryTimestamp?: string;
  }) => void;
}

export interface ClientToServerEvents {
  sendPrivateMessage: (data: {
    to: string;
    ciphertext: number[];
    iv: number[];
    expiryTimestamp?: string;
  }) => void;
}

export interface ChatMessage {
  text: string;
  sender: string;
  timestamp: string;
  expiryTimestamp?: string;
}
