"use client";

import { useState } from "react";

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage("Subscribed successfully 🎉");
        setEmail("");
      } else {
        setMessage(data.message || "Something went wrong");
      }
    } catch {
      setMessage("Error subscribing");
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
      <input
        type="email"
        placeholder="Enter your email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="px-4 py-2 rounded-md text-black w-full bg-white"
      />

      <button type="submit" disabled={loading} className="px-4 py-2 bg-white text-teal rounded-md">
        {loading ? "..." : "Subscribe"}
      </button>

      {message && <p className="text-xs mt-2 text-white">{message}</p>}
    </form>
  );
}
