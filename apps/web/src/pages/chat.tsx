import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { io, Socket } from "socket.io-client";

let socket: Socket;

interface ChatMessage {
  text: string;
  sender: string;
  timestamp: string;
}

export default function ChatPage() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("authToken");

    if (!token) {
      router.push("/login");
      return;
    }

    socket = io("http://localhost:3100", {
      auth: { token },
    });

    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("message", (msg: ChatMessage) => {
      setChat((prev) => [...prev, msg]);
    });

    socket.on("connect_error", () => {
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const sendMessage = () => {
    if (!message.trim()) return;
    socket.emit("message", { text: message });
    setChat((prev) => [
      ...prev,
      {
        text: message,
        sender: "You",
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
