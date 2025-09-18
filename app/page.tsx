"use client";

import { useState } from "react";
import ReactMarkdown from 'react-markdown';

interface Message {
  role: "user" | "bot";
  text: string;
}

interface ApiResponse {
  result: string;
  error?: string;
}

async function askGuideBot(query: string): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API error: ${res.status} - ${errorText}`);
  }

  const data: ApiResponse = await res.json();
  console.log("API response data:", data);
  return data.result;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userInput = input.trim();
    
    // Clear input immediately after submission
    setInput("");

    // Add user message
    const newMessages = [
      ...messages,
      { role: "user" as const, text: userInput }
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const botResponse = await askGuideBot(userInput);
      setMessages([...newMessages, { role: "bot", text: botResponse }]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessages([
        ...newMessages,
        { role: "bot", text: `Error: ${errorMessage}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-purple-100 p-4">
      <div className="flex flex-col h-full max-w-4xl mx-auto w-full bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Chat history */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              Start a conversation by asking about a procedure...
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`p-3 rounded-lg max-w-[80%] ${
                  msg.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-800 border"
                }`}
              >
                {msg.role === "bot" ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown 
                      components={{
                        // Style numbered lists
                        ol: (props: React.ComponentPropsWithoutRef<'ol'>) => (
                          <ol className="list-decimal list-inside space-y-2 my-2" {...props}>
                            {props.children}
                          </ol>
                        ),
                        // Style bullet lists  
                        ul: (props: React.ComponentPropsWithoutRef<'ul'>) => (
                          <ul className="list-disc list-inside space-y-1 my-2 ml-4" {...props}>
                            {props.children}
                          </ul>
                        ),
                        // Style list items
                        li: (props: React.ComponentPropsWithoutRef<'li'>) => (
                          <li className="leading-relaxed" {...props}>{props.children}</li>
                        ),
                        // Style bold text
                        strong: (props: React.ComponentPropsWithoutRef<'strong'>) => (
                          <strong className="font-bold text-gray-900" {...props}>{props.children}</strong>
                        ),
                        // Style paragraphs
                        p: (props: React.ComponentPropsWithoutRef<'p'>) => (
                          <p className="mb-2 leading-relaxed" {...props}>{props.children}</p>
                        ),
                        // Style headings
                        h3: (props: React.ComponentPropsWithoutRef<'h3'>) => (
                          <h3 className="font-bold text-lg mb-2 mt-3" {...props}>{props.children}</h3>
                        )
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="p-3 rounded-lg max-w-[80%] bg-gray-100 text-gray-600 border animate-pulse">
                GuideBot is typing...
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t bg-gray-50 p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
              placeholder="Ask about a procedure..."
              disabled={loading}
            />
            <button
              onClick={handleSend}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={loading}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}