import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { io, Socket } from "socket.io-client";
import sodium from "libsodium-wrappers";

interface ServerToClientEvents {
  message: (data: {
    ciphertext: number[];
    iv: number[];
    sender: string;
    timestamp: string;
  }) => void;
}

interface ClientToServerEvents {
  sendPrivateMessage: (data: {
    to: string;
    ciphertext: number[];
    iv: number[];
  }) => void;
}

interface ChatMessage {
  text: string;
  sender: string;
  timestamp: string;
}

export default function ChatPage() {
  const router = useRouter();
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [keyPair, setKeyPair] = useState<sodium.KeyPair | null>(null);
  const [recipient, setRecipient] = useState("");

  // 🔐 1. KEY SETUP (ilk useEffect)
  useEffect(() => {
    const setupKeyPair = async () => {
      await sodium.ready;
      const kp = sodium.crypto_kx_keypair();
      setKeyPair(kp);

      const publicKey = sodium.to_base64(
        kp.publicKey,
        sodium.base64_variants.ORIGINAL
      );
      const token = localStorage.getItem("authToken");

      await fetch("http://localhost:3100/auth/update-public-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ publicKey }),
      });

      console.log("✅ Public key uploaded to server.");
    };

    setupKeyPair();
  }, []);

  // 🔐 2. SOCKET SETUP (ikinci useEffect)
  useEffect(() => {
    if (!keyPair) return;
    const token = localStorage.getItem("authToken");
    if (!token) {
      router.push("/login");
      return;
    }

    const socket = io("http://localhost:3100", {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🔌 Connected:", socket.id);
      setConnected(true);
    });

    socket.on("message", async (msg) => {
      console.log("📥 [message received]", msg);
      if (!keyPair) return;

      try {
        const res = await fetch(
          `http://localhost:3100/users/${msg.sender}/public-key`
        );
        const data = await res.json();

        const senderPublicKey = sodium.from_base64(
          data.publicKey,
          sodium.base64_variants.ORIGINAL
        );

        const sessionKeys = sodium.crypto_kx_server_session_keys(
          keyPair.publicKey,
          keyPair.privateKey,
          senderPublicKey
        );
        const sharedKey = sessionKeys.sharedRx;

        const decrypted = sodium.crypto_secretbox_open_easy(
          new Uint8Array(msg.ciphertext),
          new Uint8Array(msg.iv),
          sharedKey
        );
        const text = sodium.to_string(decrypted);

        setChat((prev) => [
          ...prev,
          { text, sender: msg.sender, timestamp: msg.timestamp },
        ]);
      } catch (err) {
        console.error("🔐 Decryption failed", err);
      }
    });

    socket.on("connect_error", (err) => {
      console.warn("🚫 Connection failed", err);
      setConnected(false);
    });

    return () => {
      socket.disconnect();
      console.log("🧹 Disconnected socket:", socket.id);
    };
  }, [keyPair]);

  const sendMessage = async () => {
    if (!message.trim() || !keyPair || !recipient) return;

    const res = await fetch(
      `http://localhost:3100/users/${recipient}/public-key`
    );
    const data = await res.json();

    const recipientPublicKey = sodium.from_base64(
      data.publicKey,
      sodium.base64_variants.ORIGINAL
    );

    const sessionKeys = sodium.crypto_kx_client_session_keys(
      keyPair.publicKey,
      keyPair.privateKey,
      recipientPublicKey
    );
    const sharedKey = sessionKeys.sharedTx;

    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(
      sodium.from_string(message),
      nonce,
      sharedKey
    );

    socketRef.current?.emit("sendPrivateMessage", {
      to: recipient,
      ciphertext: Array.from(ciphertext),
      iv: Array.from(nonce),
    });

    setChat((prev) => [
      ...prev,
      {
        text: message,
        sender: `You → ${recipient}`,
        timestamp: new Date().toISOString(),
      },
    ]);

    setMessage("");
  };

  return (
    <div style={{ maxWidth: 600, margin: "auto", padding: "2rem" }}>
      <h1>SecureHive Chat</h1>
      <div
        style={{
          border: "1px solid #ccc",
          padding: "1rem",
          height: "300px",
          overflowY: "auto",
          marginBottom: "1rem",
        }}
      >
        {chat.map((msg, idx) => (
          <div key={idx} style={{ marginBottom: "0.5rem" }}>
            <strong>{msg.sender}: </strong>
            <span>{msg.text}</span>
          </div>
        ))}
      </div>
      <input
        type="email"
        placeholder="Send to (email)"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        style={{ width: "100%", marginBottom: "0.5rem", padding: "8px" }}
      />
      <input
        type="text"
        placeholder="Type a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={{ width: "100%", padding: "8px" }}
      />
      <button
        onClick={sendMessage}
        style={{ width: "100%", marginTop: "0.5rem" }}
        disabled={!connected}
      >
        Send
      </button>
    </div>
  );
}
