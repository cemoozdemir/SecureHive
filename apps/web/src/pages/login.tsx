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
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center">
          Welcome to SecureHive
        </h1>
        <p className="text-sm text-zinc-400 text-center">
          Enter your email to receive a magic login link.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500"
          />
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 rounded font-semibold transition ${
              loading
                ? "bg-zinc-600 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Sending..." : "Send Magic Link"}
          </button>
        </form>

        {magicLink && (
          <div className="bg-green-800 text-green-100 p-3 rounded text-sm break-words">
            ✅ Magic link (simulated):{" "}
            <a href={magicLink} className="underline break-all">
              {magicLink}
            </a>
          </div>
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
