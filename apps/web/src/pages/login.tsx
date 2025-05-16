import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [magicLink, setMagicLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMagicLink("");

    try {
      const res = await fetch("http://localhost:3100/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok) {
        setMagicLink(data.magicLink);
      } else {
        setError(data.error || "Something went wrong.");
      }
    } catch (err) {
      setError("Request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "auto", padding: "2rem" }}>
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: "8px", marginBottom: "1rem" }}
        />
        <button type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Sending..." : "Send Magic Link"}
        </button>
      </form>

      {magicLink && (
        <div style={{ marginTop: "1rem" }}>
          <p>Magic link (simulated):</p>
          <a href={magicLink}>{magicLink}</a>
        </div>
      )}

      {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}
    </div>
  );
}
