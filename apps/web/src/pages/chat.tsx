import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { io, Socket } from "socket.io-client";
import sodium from "libsodium-wrappers";
import {
  generateOrRestoreKeyPair,
  KxKeyPair,
} from "../../../../shared/crypto/keys";

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
  const [keyPair, setKeyPair] = useState<KxKeyPair | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("recipient") || "";
    }
    return "";
  });
  // auth kullanıcı bilgilerini çek

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    localStorage.setItem("recipient", value); // kullanıcı manuel yazınca kaydet
  };

  const fetchAndDecryptMessages = async (
    recipientEmail: string,
    keyPair: KxKeyPair
  ): Promise<ChatMessage[]> => {
    const token = localStorage.getItem("authToken");
    if (!token) return [];

    try {
      const res = await fetch(
        `http://localhost:3100/messages/${recipientEmail}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const messages = await res.json();
      const decryptedMessages: ChatMessage[] = [];

      for (const msg of messages) {
        console.log("🔎 Trying to decrypt message from:", msg.sender);
        try {
          const isUUID = (value: string) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
              value
            );
          const endpoint = isUUID(msg.sender)
            ? `http://localhost:3100/users/${msg.sender}/public-key`
            : `http://localhost:3100/users/email/${encodeURIComponent(
                msg.sender
              )}/public-key`;

          const userRes = await fetch(endpoint);
          const userData = await userRes.json();

          if (!userData?.publicKey) {
            console.warn("🚫 Sender has no public key. Skipping message:", msg);
            continue;
          }

          const senderPublicKey = sodium.from_base64(
            userData.publicKey,
            sodium.base64_variants.ORIGINAL
          );

          const sessionKeys = sodium.crypto_kx_server_session_keys(
            keyPair.publicKey,
            keyPair.privateKey,
            senderPublicKey
          );
          const sharedKey = sessionKeys.sharedRx;
          const decrypted = sodium.crypto_secretbox_open_easy(
            new Uint8Array(msg.ciphertext.data || msg.ciphertext),
            new Uint8Array(msg.iv.data || msg.iv),
            sharedKey
          );

          const text = sodium.to_string(decrypted);

          decryptedMessages.push({
            text,
            sender: msg.sender,
            timestamp: msg.timestamp,
          });
        } catch (err) {
          console.warn("⚠️ Failed to decrypt one message:", err);
        }
      }

      return decryptedMessages;
    } catch (err) {
      console.error("❌ Error loading messages:", err);
      return [];
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !keyPair || !recipient) return;

    const res = await fetch(
      `http://localhost:3100/users/email/${recipient}/public-key`
    );

    if (!res.ok) {
      const text = await res.text();
      console.warn("🚫 Error fetching public key:", text);
      return;
    }

    const data = await res.json();
    if (!data?.publicKey) {
      console.warn("🚫 No public key found for recipient");
      return;
    }

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

    await fetch("http://localhost:3100/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({
        to: recipient,
        ciphertext: Array.from(ciphertext),
        iv: Array.from(nonce),
      }),
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

  // 🔐 1. KEY SETUP (ilk useEffect)
  useEffect(() => {
    const setupKey = async () => {
      const kp = await generateOrRestoreKeyPair(); // ✅ zaten key burada üretiliyor
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

    setupKey();
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
        const isUUID = (value: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
            value
          );

        const endpoint = isUUID(msg.sender)
          ? `http://localhost:3100/users/${msg.sender}/public-key`
          : `http://localhost:3100/users/email/${encodeURIComponent(
              msg.sender
            )}/public-key`;

        const userRes = await fetch(endpoint);

        if (!userRes.ok) {
          console.warn("🚫 Could not fetch public key for sender:", msg.sender);
          return; // ← bu mesajı atla
        }

        const data = await userRes.json();

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
          new Uint8Array(msg.ciphertext.data || msg.ciphertext),
          new Uint8Array(msg.iv.data || msg.iv),
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

  useEffect(() => {
    if (!keyPair || !userId || !userEmail) return;

    console.log("🎯 Fetching messages for:", userEmail);
    fetchAndDecryptMessages(userEmail, keyPair).then(setChat);
  }, [keyPair, userId, userEmail]);

  useEffect(() => {
    if (!keyPair) return;

    const saved = localStorage.getItem("recipient");
    if (saved) {
      setRecipient(saved);
    }
  }, [keyPair]);

  // bu useEffect içinde token ile kullanıcıyı çek
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    fetch("http://localhost:3100/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          console.warn("🚫 /auth/me failed. Response:", text);
          throw new Error("Invalid response from /auth/me");
        }
        return res.json();
      })
      .then((data) => {
        setUserId(data.userId);
        setUserEmail(data.email);
        console.log("✅ Logged in as:", data.email);
      })
      .catch((err) => {
        console.error("❌ Failed to load user:", err);
      });
  }, []);

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
        onChange={(e) => handleRecipientChange(e.target.value)}
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
      <button
        onClick={() => {
          localStorage.removeItem("keypair");
          window.location.reload();
        }}
      >
        Rotate KeyPair
      </button>
      <button
        onClick={() => {
          localStorage.removeItem("recipient");
          setRecipient("");
          setChat([]);
        }}
      >
        ❌ Clear Chat
      </button>
    </div>
  );
}
