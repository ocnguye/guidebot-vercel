"use client";

import { useState } from "react";

interface Message {
  role: "user" | "bot";
  text: string;
}

async function askGuideBot(query: string) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  console.log("API response data:", data); // 🔹 add this
  return data.result; // ensure it's data.result, not data itself
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    // Add user message
    const newMessages = [
      ...messages,
      { role: "user" as "user", text: input }
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const botResponse = await askGuideBot(input);
      setMessages([...newMessages, { role: "bot", text: botResponse }]);
    } catch (err: any) {
      setMessages([
        ...newMessages,
        { role: "bot", text: `Error: ${err.message}` },
      ]);
    } finally {
      setInput("");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4 border rounded-lg shadow-md bg-white">
      {/* Chat history */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-2">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-2 rounded-md max-w-[80%] ${
              msg.role === "user"
                ? "bg-blue-500 text-white self-end ml-auto"
                : "bg-gray-200 text-black self-start"
            }`}
          >
            {msg.text}
          </div>
        ))}
        {loading && (
          <div className="p-2 rounded-md max-w-[80%] bg-gray-200 self-start animate-pulse">
            GuideBot is typing...
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-1 p-2 border rounded-l-md focus:outline-none"
          placeholder="Ask about a procedure..."
          disabled={loading}
        />
        <button
          onClick={handleSend}
          className="bg-blue-600 text-white px-4 rounded-r-md hover:bg-blue-700 disabled:opacity-50"
          disabled={loading}
        >
          Send
        </button>
      </div>
    </div>
  );
}