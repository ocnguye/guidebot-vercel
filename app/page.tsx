"use client";

import { useState } from "react";
import ReactMarkdown from 'react-markdown';
import UsedReports, { UsedReport } from "./components/UsedReports";


interface Message {
  role: "user" | "bot";
  text: string;
}

interface ApiResponse {
  result: string;
  error?: string;
}

async function askGuideBot(query: string, conversationHistory: Message[] = []): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      query, 
      conversationHistory: conversationHistory.slice(-6) // Send last 6 messages for context
    }),
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
  const [usedReports, setUsedReports] = useState<UsedReport[]>([]);


  const handleSend = async () => {
    if (!input.trim()) return;
    const userInput = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user" as const, text: userInput }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userInput, conversationHistory: messages }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: "bot", text: data.result }]);
      setUsedReports(data.usedReports || []);
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

  // ...existing code...
  return (
    <div className="flex flex-col h-screen bg-purple-100 p-4">
      <div className="flex flex-1 h-full max-w-6xl mx-auto w-full bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Main chat area */}
        <div className="flex flex-col flex-1">
          {/* Header */}
          <div className="bg-purple-300 py-5 px-6">
            <h1 className="text-3xl font-bold text-white text-center tracking-wide">GuideBot</h1>
          </div>
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
                      ? "bg-purple-300 text-white"
                      : "bg-gray-100 text-gray-800 border"
                  }`}
                >
                  {msg.role === "bot" ? (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown 
                        components={{
                          ol: (props) => (
                            <ol {...props} className="list-decimal list-inside space-y-2 my-2">
                              {props.children}
                            </ol>
                          ),
                          ul: (props) => (
                            <ul {...props} className="list-disc list-inside space-y-1 my-2 ml-4">
                              {props.children}
                            </ul>
                          ),
                          li: (props) => (
                            <li {...props} className="leading-relaxed">
                              {props.children}
                            </li>
                          ),
                          strong: (props) => (
                            <strong {...props} className="font-bold text-gray-900">
                              {props.children}
                            </strong>
                          ),
                          p: (props) => (
                            <p {...props} className="mb-2 leading-relaxed">
                              {props.children}
                            </p>
                          ),
                          h3: (props) => (
                            <h3 {...props} className="font-bold text-lg mb-2 mt-3">
                              {props.children}
                            </h3>
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
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-transparent text-gray-800"
                placeholder="Ask about a procedure..."
                disabled={loading}
              />
              <button
                onClick={handleSend}
                className="bg-purple-300 text-white px-6 py-3 rounded-lg hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={loading}
              >
                Send
              </button>
            </div>
          </div>
        </div>
        {/* Sidebar for used reports */}
        <UsedReports reports={usedReports} />
      </div>
    </div>
  );
}
