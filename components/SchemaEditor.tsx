import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

type FieldType = "radio" | "list";

export interface SchemaField {
  type: FieldType;
  max_points?: number;
  key_field?: boolean;
  options?: string[];
  description?: string;
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
  const [schemaName, setSchemaName] = useState("");
  const [availableSchemas, setAvailableSchemas] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const [newType, setNewType] = useState<FieldType>("radio");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);
  // Track collapsed/expanded state for each field
  const [collapsedFields, setCollapsedFields] = useState<{ [field: string]: boolean }>({});

  // Fetch available schemas on mount
  useEffect(() => {
    fetch("/api/schemas")
      .then(res => res.json())
      .then(setAvailableSchemas);
  }, []);

  // Load schema when schemaName changes and matches an existing schema
  useEffect(() => {
    if (schemaName && availableSchemas.includes(schemaName)) {
      fetch(`/api/schemas?name=${encodeURIComponent(schemaName)}`)
        .then(res => res.json())
        .then(data => {
          setSchema(data);
          // Reset collapsed state when loading a new schema
          setCollapsedFields({});
        });
    } else if (!schemaName) {
      setSchema({});
      setCollapsedFields({});
    }
  }, [schemaName, availableSchemas, setSchema]);

  function addField() {
    if (!newField.trim() || schema[newField]) return;
    setSchema({
      ...schema,
      [newField]: {
        type: newType,
        max_points: newType === "radio" ? 1 : 1,
        key_field: false,
        options: [],
        description: newDescription,
      },
    });
    setNewField("");
    setNewDescription("");
  }

  function removeField(field: string) {
    const copy = { ...schema };
    delete copy[field];
    setSchema(copy);
    setCollapsedFields(prev => {
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  }

  function updateField(field: string, key: keyof SchemaField, value: any) {
    setSchema({
      ...schema,
      [field]: {
        ...schema[field],
        [key]: value,
        ...(key === "type" && value === "radio" ? { max_points: 1 } : {}),
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

  async function saveSchema() {
    if (!schemaName.trim()) {
      alert("Please enter a schema name.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/schemas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: schemaName, schema }),
    });
    setSaving(false);
    if (res.ok) {
      alert("Schema saved!");
      // Refresh available schemas
      fetch("/api/schemas")
        .then(res => res.json())
        .then(setAvailableSchemas);
    } else {
      alert("Failed to save schema.");
    }
  }

  function toggleCollapse(field: string) {
    setCollapsedFields(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schema Editor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6 text-sm text-gray-600">
          <ul className="list-disc ml-6">
            <li>
              <b>Schema Name:</b> The name for this schema (required to save or edit).
            </li>
            <li>
              <b>Field Type:</b> <span className="text-blue-700">radio</span> (single choice), <span className="text-blue-700">list</span> (multiple choices)
            </li>
            <li>
              <b>Description:</b> Optional explanation for this field.
            </li>
            <li>
              <b>Options:</b> The selectable values for this field, if any.
            </li>
            <li>
              <b>max_points:</b> Maximum number of choices allowed for this field. 
            </li>
            <li>
              <b>key_field:</b> Mark as a key field for grouping or identification.
            </li>
          </ul>
        </div>
        <div className="mb-6 flex flex-col md:flex-row md:items-center gap-2">
          <label className="text-xs font-semibold md:w-32">Schema Name:</label>
          <select
            value={schemaName}
            onChange={e => setSchemaName(e.target.value)}
            className="border rounded px-2 py-1 w-full md:w-1/2"
          >
            <option value="">-- New Schema --</option>
            {availableSchemas.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <Input
            value={schemaName}
            onChange={e => setSchemaName(e.target.value)}
            placeholder="Or type new schema name"
            className="w-full md:w-1/2"
          />
        </div>
        {Object.entries(schema).map(([field, def]) => (
          <div key={field} className="border rounded p-3 mb-4 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCollapse(field)}
                  className="text-xs px-2 py-1 rounded hover:bg-muted transition-colors border"
                  aria-label={collapsedFields[field] ? "Expand" : "Collapse"}
                >
                  {collapsedFields[field] ? "▶" : "▼"}
                </button>
                <span className="font-semibold">{field}</span>
                <span className="text-xs text-gray-500 ml-2">{def.type}</span>
              </div>
              <Button
                type="button"
                variant="default"
                onClick={() => removeField(field)}
              >
                Remove
              </Button>
            </div>
            {!collapsedFields[field] && (
              <>
                <div className="flex flex-col md:flex-row md:items-center gap-2 mt-2">
                  <Input
                    value={field}
                    onChange={e => {
                      const newName = e.target.value;
                      if (!newName) return;
                      const { [field]: old, ...rest } = schema;
                      setSchema({ ...rest, [newName]: old });
                      setCollapsedFields(prev => {
                        const { [field]: oldCollapsed, ...restCollapsed } = prev;
                        return { ...restCollapsed, [newName]: oldCollapsed };
                      });
                    }}
                    className="w-full md:w-1/4"
                    placeholder="Field name"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold">Type:</label>
                    <select
                      value={def.type}
                      onChange={e =>
                        updateField(field, "type", e.target.value as FieldType)
                      }
                      className="border rounded px-2 py-1"
                    >
                      <option value="radio">radio (single choice)</option>
                      <option value="list">list (multiple choice)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold">max_points:</label>
                    <Input
                      type="number"
                      value={def.max_points ?? ""}
                      min={1}
                      onChange={e =>
                        updateField(field, "max_points", Number(e.target.value))
                      }
                      className="w-20"
                      placeholder="max_points"
                      disabled={def.type === "radio"}
                    />
                    {def.type === "radio" && (
                      <span className="text-xs text-gray-500">(always 1 for radio)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold">key_field:</label>
                    <input
                      type="checkbox"
                      checked={!!def.key_field}
                      onChange={e =>
                        updateField(field, "key_field", e.target.checked)
                      }
                      className="h-4 w-4"
                    />
                  </div>
                </div>
                <div className="mt-2 flex flex-col md:flex-row md:items-center gap-2">
                  <label className="text-xs font-semibold md:w-24">Description:</label>
                  <Input
                    value={def.description ?? ""}
                    onChange={e => updateField(field, "description", e.target.value)}
                    className="w-full md:w-2/3"
                    placeholder="add a description (optional)"
                  />
                </div>
                <div className="mt-3">
                  <div className="font-semibold text-xs mb-1">Options:</div>
                  {(def.options || []).map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2 mb-1">
                      <Input
                        value={opt}
                        onChange={e => updateOption(field, idx, e.target.value)}
                        className="w-1/2"
                        placeholder={`Option ${idx + 1}`}
                      />
                      <Button
                        type="button"
                        variant="secondary"
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
                    variant="secondary"
                    onClick={() => addOption(field)}
                    className="mt-1"
                  >
                    Add Option
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        <div className="flex flex-col md:flex-row gap-2 mt-4 items-center">
          <Input
            value={newField}
            onChange={e => setNewField(e.target.value)}
            placeholder="New field name"
            className="w-full md:w-1/3"
          />
          <select
            value={newType}
            onChange={e => setNewType(e.target.value as FieldType)}
            className="border rounded px-2 py-1"
          >
            <option value="radio">radio (single choice)</option>
            <option value="list">list (multiple choice)</option>
          </select>
          <Input
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full md:w-1/3"
          />
          <Button type="button" variant="default" onClick={addField}>
            Add Field
          </Button>
        </div>
        <Button
          className="mt-6"
          variant="default"
          onClick={saveSchema}
          disabled={saving || !schemaName.trim()}
        >
          {saving ? "Saving..." : "Save Schema"}
        </Button>
      </CardContent>
    </Card>
  );
}