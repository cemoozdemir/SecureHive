import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { io, Socket } from "socket.io-client";

let socket: Socket;

export default function ChatPage() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("authToken");

    if (!token) {
      router.push("/login");
      return;
    }

    socket = io("http://localhost:3100", {
      auth: {
        token: token,
      },
    });

    socket.on("connect", () => {
      setConnected(true);
      console.log("Connected to socket:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      setError("Socket connection failed.");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div style={{ maxWidth: 400, margin: "auto", padding: "2rem" }}>
      <h1>Chat Page</h1>
      {connected ? (
        <p style={{ color: "green" }}>✅ Connected to server</p>
      ) : error ? (
        <p style={{ color: "red" }}>{error}</p>
      ) : (
        <p>Connecting...</p>
      )}
    </div>
  );
}
