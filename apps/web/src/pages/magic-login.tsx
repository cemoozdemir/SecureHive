import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function MagicLoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Verifying...");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = router.query.token;

    if (!token || typeof token !== "string") {
      setStatus("Invalid or missing token.");
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(
          `http://localhost:3100/auth/verify?token=${token}`
        );
        const data = await res.json();

        if (!res.ok) {
          setStatus("Verification failed.");
          setError(data.error || "Unknown error");
          return;
        }

        // Token’ı localStorage’a kaydet
        localStorage.setItem("authToken", data.token);
        console.log(localStorage.getItem("authToken"));
        setStatus("Login successful!");

        // 1 saniye sonra anasayfaya yönlendir
        setTimeout(() => {
          router.push("/");
        }, 1000);
      } catch (err) {
        setStatus("Error during verification.");
        setError("Unexpected error.");
      }
    };

    verifyToken();
  }, [router.query.token]);

  return (
    <div style={{ maxWidth: 400, margin: "auto", padding: "2rem" }}>
      <h1>{status}</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
