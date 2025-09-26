import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

type FieldType = "radio" | "list";

export interface SchemaField {
  type: string;
  max_points?: number;
  key_field?: boolean;
  options?: string[];
  [key: string]: any;
}

export interface Schema {
  [field: string]: SchemaField;
}

export default function SchemaEditor({
  schema,
  setSchema,
}: {
  schema: Schema;
  setSchema: (s: Schema) => void;
}) {
  const [newField, setNewField] = useState("");
  const [newType, setNewType] = useState<FieldType>("radio");

  function addField() {
    if (!newField.trim() || schema[newField]) return;
    setSchema({
      ...schema,
      [newField]: {
        type: newType,
        max_points: 1,
        options: [],
      },
    });
    setNewField("");
  }

  function removeField(field: string) {
    const copy = { ...schema };
    delete copy[field];
    setSchema(copy);
  }

  function updateField(field: string, key: keyof SchemaField, value: any) {
    setSchema({
      ...schema,
      [field]: {
        ...schema[field],
        [key]: value,
      },
    });
  }

  function updateOption(field: string, idx: number, value: string) {
    const options = [...(schema[field].options || [])];
    options[idx] = value;
    updateField(field, "options", options);
  }

  function addOption(field: string) {
    updateField(field, "options", [...(schema[field].options || []), ""]);
  }

  function removeOption(field: string, idx: number) {
    const options = [...(schema[field].options || [])];
    options.splice(idx, 1);
    updateField(field, "options", options);
  }

  function saveSchemaToDisk() {
    // You'd POST to an API route that writes to data/schemas
    fetch("/api/schema/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schema),
    }).then(() => alert("Schema saved!"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schema Editor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(schema).map(([field, def]) => (
            <div key={field} className="border rounded p-2 mb-2">
              <div className="flex items-center gap-2">
                <Input
                  value={field}
                  onChange={e => {
                    const newName = e.target.value;
                    if (!newName) return;
                    const { [field]: old, ...rest } = schema;
                    setSchema({ ...rest, [newName]: old });
                  }}
                  className="w-1/3"
                />
                <select
                  value={def.type}
                  onChange={e =>
                    updateField(field, "type", e.target.value as FieldType)
                  }
                  className="border rounded px-2 py-1"
                >
                  <option value="radio">radio</option>
                  <option value="list">list</option>
                </select>
                <Input
                  type="number"
                  value={def.max_points}
                  min={1}
                  onChange={e =>
                    updateField(field, "max_points", Number(e.target.value))
                  }
                  className="w-20"
                  placeholder="max_points"
                />
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={!!def.key_field}
                    onChange={e =>
                      updateField(field, "key_field", e.target.checked)
                    }
                  />
                  key_field
                </label>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => removeField(field)}
                  className="ml-auto"
                >
                  Remove
                </Button>
              </div>
              <div className="mt-2">
                <div className="font-semibold text-xs">Options:</div>
                {(def.options || []).map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-1">
                    <Input
                      value={opt}
                      onChange={e => updateOption(field, idx, e.target.value)}
                      className="w-1/2"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeOption(field, idx)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => addOption(field)}
                  className="mt-1"
                >
                  Add Option
                </Button>
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-4">
            <Input
              value={newField}
              onChange={e => setNewField(e.target.value)}
              placeholder="New field name"
              className="w-1/3"
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as FieldType)}
              className="border rounded px-2 py-1"
            >
              <option value="radio">radio</option>
              <option value="list">list</option>
            </select>
            <Button type="button" onClick={addField}>
              Add Field
            </Button>
          </div>
          <Button className="mt-4" onClick={saveSchemaToDisk}>
            Save Schema
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}