import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function MagicLoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Verifying...");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = router.query.token;

    if (!token || typeof token !== "string") {
      setStatus("❌ Invalid or missing token.");
      setError("The magic link is either broken or expired.");
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(
          `http://localhost:3100/auth/verify?token=${token}`
        );
        const data = await res.json();

        if (!res.ok) {
          setStatus("❌ Verification failed.");
          setError(data.error || "Unknown error");
          return;
        }

        localStorage.setItem("authToken", data.token);
        setStatus("✅ Login successful! Redirecting...");
        setTimeout(() => {
          router.push("/chat");
        }, 1500);
      } catch (err) {
        setStatus("❌ Error during verification.");
        setError("Unexpected error. Please try again.");
      }
    };

    verifyToken();
  }, [router.query.token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white px-4">
      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl w-full max-w-md text-center shadow-lg">
        <h1 className="text-2xl font-bold mb-4">Magic Link Login</h1>

        <div className="text-lg font-medium mb-2">{status}</div>

        {error && <div className="text-sm text-red-400 mt-2">{error}</div>}

        {!error && status === "Verifying..." && (
          <div className="mt-4 text-sm text-zinc-400 animate-pulse">
            Please wait while we verify your token...
          </div>
        )}
      </div>
    </div>
  );
}
