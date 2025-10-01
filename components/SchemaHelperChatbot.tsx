import React, { useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Schema } from "./SchemaEditor";

interface SchemaHelperChatbotProps {
  onSchemaSuggested: (schema: Schema) => void;
  onSchemaAppended: (schema: Schema) => void;
  currentSchema: Schema;
}

export default function SchemaHelperChatbot({ onSchemaSuggested, onSchemaAppended, currentSchema }: SchemaHelperChatbotProps) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: "assistant", content: "Hi! Describe the kind of medical schema you want to create, and I'll suggest fields and options for you." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedSchema, setSuggestedSchema] = useState<Schema | null>(null);

  async function sendMessage() {
    if (!input.trim()) return;
    setMessages(msgs => [...msgs, { role: "user", content: input }]);
    setLoading(true);
    setInput("");

    // Send currentSchema to the API as well
    const res = await fetch("/api/schema-helper-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        messages: [...messages, { role: "user", content: input }],
        currentSchema
      }),
    });
    setLoading(false);

    if (res.ok) {
      const data = await res.json();
      setMessages(msgs => [...msgs, { role: "assistant", content: data.reply }]);
      if (data.schema) setSuggestedSchema(data.schema);
    } else {
      setMessages(msgs => [...msgs, { role: "assistant", content: "Sorry, I couldn't generate a schema. Try again!" }]);
    }
  }

  function handleUseSchema() {
    if (suggestedSchema) {
      onSchemaSuggested(suggestedSchema);
      setSuggestedSchema(null);
    }
  }

  function handleAppendSchema() {
    if (suggestedSchema) {
      // Merge: existing fields take precedence, new fields are added
      const merged = { ...currentSchema, ...suggestedSchema };
      onSchemaAppended(merged);
      setSuggestedSchema(null);
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-muted max-w-xl">
      <div className="mb-2 font-bold">Schema Helper Chatbot</div>
      <div className="h-48 overflow-y-auto bg-white rounded p-2 mb-2 border">
        {messages.map((msg, idx) => (
          <div key={idx} className={msg.role === "user" ? "text-right" : "text-left"}>
            <span className={msg.role === "user" ? "text-purple-700" : "text-sky-700"}>
              {msg.role === "user" ? "You: " : "Bot: "}
            </span>
            {msg.content}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Describe your schema needs..."
          onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
          disabled={loading}
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()}>
          {loading ? "Thinking..." : "Send"}
        </Button>
      </div>
      {suggestedSchema && (
        <div className="mt-4 p-2 bg-blue-50 border rounded">
          <div className="mb-2 font-semibold">Suggested Schema:</div>
          <pre className="text-xs bg-white p-2 rounded border max-h-40 overflow-auto">{JSON.stringify(suggestedSchema, null, 2)}</pre>
          <Button className="mt-2 mr-2" onClick={handleUseSchema}>
            Use this schema
          </Button>
          <Button className="mt-2" variant="secondary" onClick={handleAppendSchema}>
            Append to schema
          </Button>
        </div>
      )}
    </div>
  );
}