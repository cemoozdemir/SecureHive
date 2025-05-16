import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to /login when the user visits this page
    router.replace("/login");
  }, [router]);

  return null; // Optional: render nothing while redirecting
}
