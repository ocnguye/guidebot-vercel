"use client"

import React, { useState } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

export const Checkbox: React.FC<CheckboxProps> = ({ className, ...props }) => {
  const [checked, setChecked] = useState(props.checked || false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChecked(e.target.checked);
    if (props.onChange) props.onChange(e);
  };

  return (
    <label
      className={cn(
        "inline-flex items-center cursor-pointer select-none",
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        className="peer sr-only"
        {...props}
      />
      <span
        className={cn(
          "flex items-center justify-center w-4 h-4 rounded border border-gray-300 shadow-sm transition-colors",
          checked
            ? "bg-blue-500 border-blue-500 text-white"
            : "bg-white border-gray-300 text-transparent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400",
          props.disabled ? "opacity-50 cursor-not-allowed" : ""
        )}
      >
        {checked && <CheckIcon className="w-3.5 h-3.5" />}
      </span>
    </label>
  );
};
