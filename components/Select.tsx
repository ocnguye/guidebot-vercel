"use client"

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

type SelectProps = {
  value?: string;
  onChange?: (value: string) => void;
  children: React.ReactNode;
  placeholder?: string;
  className?: string;
};

type SelectItemProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void; // allow onClick for cloning
};

export const SelectItem: React.FC<SelectItemProps> = ({ value, children, className, onClick }) => (
  <li
    className={cn(
      "cursor-pointer select-none relative flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-gray-100",
      className
    )}
    data-value={value}
    onClick={onClick}
  >
    <span className="absolute right-2 flex items-center">
      <CheckIcon className="size-4 opacity-0" data-slot="check" />
    </span>
    {children}
  </li>
);

export const Select: React.FC<SelectProps> = ({ value, onChange, children, placeholder = "Select...", className }) => {
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value || "");
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = (val: string) => {
    setSelectedValue(val);
    onChange?.(val);
    setOpen(false);
  };

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Map children safely
  const renderedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement<SelectItemProps>(child)) return null;

    const childValue = child.props.value;
    const isSelected = childValue === selectedValue;

    return React.cloneElement(child, {
      onClick: () => handleSelect(childValue),
      className: cn(
        child.props.className,
        isSelected && "font-medium text-blue-600"
      ),
      children: (
        <>
          {child.props.children}
          {isSelected && <CheckIcon className="size-4 absolute right-2 text-blue-600" />}
        </>
      ),
    });
  });

  return (
    <div ref={containerRef} className={cn("relative w-fit", className)}>
      <button
        type="button"
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
          selectedValue ? "" : "text-gray-400"
        )}
        onClick={() => setOpen(!open)}
      >
        {selectedValue || placeholder}
        <ChevronDownIcon className="size-4 opacity-50" />
      </button>

      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-md">
          {renderedChildren}
        </ul>
      )}
    </div>
  );
};
