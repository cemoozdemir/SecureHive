import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { io, Socket } from "socket.io-client";
import sodium from "libsodium-wrappers";
import {
  generateOrRestoreKeyPair,
  KxKeyPair,
} from "../../../../shared/crypto/keys";

import {
  ServerToClientEvents,
  ClientToServerEvents,
  ChatMessage,
} from "../../../../shared/types/chat";

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
  const [recipient, setRecipient] = useState("");
  const [mode, setMode] = useState<"standard" | "secret">("standard");
  const sharedKeyRef = useRef<Uint8Array | null>(null);
  const [expirationMinutes, setExpirationMinutes] = useState(1); // varsayılan 1 dk
  const [expirationSeconds, setExpirationSeconds] = useState(5); // varsayılan 60 saniye
  // const expirationRef = useRef(expirationMinutes);
  // const expirationRef = useRef(expirationSeconds);
  const [tick, setTick] = useState(0);

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

          if (msg.sender === userEmail) continue;

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

    sharedKeyRef.current = sharedKey;

    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(
      sodium.from_string(message),
      nonce,
      sharedKey
    );

    const now = new Date();
    const expiry = new Date(
      now.getTime() + expirationRef.current * 1000
    ).toISOString();

    console.log("📤 Sent message with expiry:", expiry);

    socketRef.current?.emit("sendPrivateMessage", {
      to: recipient,
      ciphertext: Array.from(ciphertext),
      iv: Array.from(nonce),
      expiryTimestamp: expiry,
    });

    if (mode === "secret") {
      const now = new Date();
      const expiry = new Date(
        now.getTime() + expirationRef.current * 1000
      ).toISOString();

      console.log("📤 Sent message with expiry:", expiry);

      const newMsg = {
        text: message,
        sender: `You → ${recipient}`,
        timestamp: now.toISOString(),
        expiryTimestamp: expiry,
      };

      const updatedMessages = [...chat, newMsg];
      setChat(updatedMessages);

      if (sharedKeyRef.current) {
        const encrypted = encryptLocalMessages(
          updatedMessages,
          sharedKeyRef.current
        );
        localStorage.setItem(
          "secretMessagesEncrypted",
          JSON.stringify(encrypted)
        );
      }

      setMessage("");
      return;
    }

    // Standard Mode: backend'e de kaydet
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

  const encryptLocalMessages = (
    messages: ChatMessage[],
    sharedKey: Uint8Array
  ) => {
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const plaintext = sodium.from_string(JSON.stringify(messages));
    const ciphertext = sodium.crypto_secretbox_easy(
      plaintext,
      nonce,
      sharedKey
    );

    return {
      ciphertext: Array.from(ciphertext),
      nonce: Array.from(nonce),
    };
  };

  const decryptLocalMessages = (
    data: { ciphertext: number[]; nonce: number[] },
    sharedKey: Uint8Array
  ): ChatMessage[] => {
    try {
      const decrypted = sodium.crypto_secretbox_open_easy(
        new Uint8Array(data.ciphertext),
        new Uint8Array(data.nonce),
        sharedKey
      );
      return JSON.parse(sodium.to_string(decrypted));
    } catch (err) {
      console.warn("❌ Failed to decrypt local messages", err);
      return [];
    }
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
      console.log("📥 Received message with expiry:", msg.expiryTimestamp);
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
          return;
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

        if (
          msg.expiryTimestamp &&
          Date.parse(msg.expiryTimestamp) <= Date.now()
        ) {
          console.log("⏳ Message already expired, skipping:", msg);
          return;
        }

        const newMsg: ChatMessage = {
          text,
          sender: msg.sender,
          timestamp: msg.timestamp,
          expiryTimestamp: msg.expiryTimestamp,
        };

        setChat((prev) => {
          const updated = [...prev, newMsg];

          if (msg.expiryTimestamp && sharedKeyRef.current) {
            const encrypted = encryptLocalMessages(
              updated,
              sharedKeyRef.current
            );
            localStorage.setItem(
              "secretMessagesEncrypted",
              JSON.stringify(encrypted)
            );
            console.log(
              "💾 Saved received message to localStorage (secretMessagesEncrypted)"
            );
          }

          return updated;
        });
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

  const [expiryControl, setExpiryControl] = useState({
    seconds: 5,
    tick: 0,
  });
  const expirationRef = useRef<number>(expiryControl.seconds);

  // 🔁 Tick artırıcı useEffect (her saniye)
  useEffect(() => {
    const interval = setInterval(() => {
      setExpiryControl((prev) => ({
        ...prev,
        tick: prev.tick + 1,
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ⏳ Expiry kontrolü (5 saniyede bir localStorage güncellemesi)
  useEffect(() => {
    if (mode !== "secret") return;

    const interval = setInterval(() => {
      const now = new Date();
      console.log(
        "⏳ [Interval] Checking for expired messages at",
        now.toISOString()
      );

      setChat((prev) => {
        const filtered = prev.filter((msg: any) => {
          const isExpired =
            msg.expiryTimestamp &&
            Date.parse(msg.expiryTimestamp) <= Date.now();

          if (isExpired) {
            console.log("🗑️ Expired message:", msg);
            return false; // filtreleme için
          }

          return !isExpired;
        });

        if (filtered.length !== prev.length && sharedKeyRef.current) {
          const encrypted = encryptLocalMessages(
            filtered,
            sharedKeyRef.current
          );
          localStorage.setItem(
            "secretMessagesEncrypted",
            JSON.stringify(encrypted)
          );
          console.log(
            "🔐 Encrypted localStorage updated after expiry cleanup."
          );
        }

        return filtered;
      });
    }, 5_000);

    return () => clearInterval(interval);
  }, [mode]);

  // 🎯 Expiration süresini anlık yansıtmak için useEffect
  useEffect(() => {
    expirationRef.current = expiryControl.seconds;
  }, [expiryControl.seconds]);

  useEffect(() => {
    if (mode !== "secret") return;

    const now = new Date();
    setChat((prev) => {
      const filtered = prev.filter(
        (msg) =>
          !msg.expiryTimestamp ||
          new Date(msg.expiryTimestamp).getTime() > now.getTime()
      );

      if (filtered.length !== prev.length && sharedKeyRef.current) {
        const encrypted = encryptLocalMessages(filtered, sharedKeyRef.current);
        localStorage.setItem(
          "secretMessagesEncrypted",
          JSON.stringify(encrypted)
        );
      }

      return filtered;
    });
  }, [tick, mode]);

  useEffect(() => {
    const saved = localStorage.getItem("recipient");
    if (saved) setRecipient(saved);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("mode") as "standard" | "secret" | null;
    if (saved) setMode(saved);
  }, []);

  useEffect(() => {
    if (!keyPair) return;

    if (mode === "secret") {
      const encryptedData = localStorage.getItem("secretMessagesEncrypted");
      if (!encryptedData || !sharedKeyRef.current) return;

      const parsed = JSON.parse(encryptedData);
      const decrypted = decryptLocalMessages(parsed, sharedKeyRef.current);
      setChat(decrypted);
      return;
    }

    if (!userId || !userEmail) return;

    console.log("🎯 Fetching messages for:", userEmail);
    fetchAndDecryptMessages(userEmail, keyPair).then(setChat);
  }, [keyPair, userId, userEmail, mode]);

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

  // ⏳ Her saniyede bir expiration kontrolü (alıcı tarafı dahil)
  useEffect(() => {
    if (mode !== "secret") return;

    const now = new Date();

    setChat((prev) => {
      const filtered = prev.filter(
        (msg) =>
          !msg.expiryTimestamp ||
          new Date(msg.expiryTimestamp).getTime() > now.getTime()
      );

      if (filtered.length !== prev.length && sharedKeyRef.current) {
        const encrypted = encryptLocalMessages(filtered, sharedKeyRef.current);
        localStorage.setItem(
          "secretMessagesEncrypted",
          JSON.stringify(encrypted)
        );
        console.log("🧹 [tick] Cleared expired messages (receiver side)");
      }

      return filtered;
    });
  }, [expiryControl.tick, mode]);

  return (
    <div style={{ maxWidth: 600, margin: "auto", padding: "2rem" }}>
      <h1>SecureHive Chat ({mode === "secret" ? "Secret" : "Standard"})</h1>
      <div className="flex items-center space-x-4 mb-2">
        <span className="text-sm text-zinc-400">Current Mode:</span>
        <span
          className={`px-2 py-1 text-xs rounded font-semibold ${
            mode === "secret" ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {mode.toUpperCase()}
        </span>
        <button
          onClick={() => {
            const newMode = mode === "standard" ? "secret" : "standard";
            setMode(newMode);
            localStorage.setItem("mode", newMode);
            setChat([]);
          }}
          className="px-4 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-white font-semibold"
        >
          Switch to {mode === "standard" ? "Secret" : "Standard"} Mode
        </button>
      </div>
      <div className="border border-zinc-700 rounded p-4 h-72 overflow-y-auto bg-zinc-800 mb-4 space-y-2">
        {chat.length === 0 && (
          <p className="text-zinc-400 italic">No messages yet.</p>
        )}
        {chat.map((msg, idx) => {
          const isOwnMessage = msg.sender.startsWith("You");
          return (
            <div
              key={idx}
              className={`flex ${
                isOwnMessage ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded-lg shadow ${
                  isOwnMessage
                    ? "bg-green-600 text-white self-end"
                    : "bg-zinc-700 text-white self-start"
                }`}
              >
                <div className="text-sm font-semibold mb-1">{msg.sender}</div>
                <div className="text-base">{msg.text}</div>
                {msg.expiryTimestamp && (
                  <div className="text-xs text-zinc-300 mt-1">
                    ⏳ expires in{" "}
                    {Math.max(
                      0,
                      Math.floor(
                        (new Date(msg.expiryTimestamp).getTime() - Date.now()) /
                          1000
                      )
                    )}
                    s
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-2 mb-4">
        <input
          type="email"
          placeholder="Send to (email)"
          value={recipient}
          onChange={(e) => handleRecipientChange(e.target.value)}
          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-400"
        />
        <input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-600 rounded text-white placeholder-zinc-400"
        />
      </div>

      <button
        onClick={sendMessage}
        disabled={!connected}
        className={`w-full py-2 mb-4 rounded font-semibold ${
          connected
            ? "bg-blue-600 hover:bg-blue-700"
            : "bg-blue-800 opacity-50 cursor-not-allowed"
        }`}
      >
        Send
      </button>
      <div className="flex space-x-4">
        <button
          onClick={() => {
            localStorage.removeItem("keypair");
            localStorage.removeItem("secretMessages");
            localStorage.removeItem("recipient");
            window.location.reload();
          }}
          className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded font-semibold"
        >
          🔁 Rotate KeyPair
        </button>
        <button
          onClick={() => {
            localStorage.removeItem("recipient");
            localStorage.removeItem("secretMessages");
            setRecipient("");
            setChat([]);
          }}
          className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-semibold"
        >
          ❌ Clear Chat
        </button>
      </div>
    </div>
  );
}
