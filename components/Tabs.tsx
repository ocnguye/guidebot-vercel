"use client"

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface TabsProps {
  value?: string; // controlled value
  defaultValue?: string; // optional initial value
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

type TabTriggerProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

type TabContentProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
};

export const TabsTrigger: React.FC<TabTriggerProps & { onClick?: () => void; active?: boolean }> = ({
  value,
  children,
  className,
  onClick,
  active = false,
}) => (
  <button
    onClick={onClick}
    className={cn(
      "px-4 py-2 rounded-md border text-sm font-medium",
      active ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700",
      className
    )}
  >
    {children}
  </button>
);

export const TabsContent: React.FC<TabContentProps & { active?: boolean }> = ({ children, active, className }) =>
  active ? <div className={cn("p-4", className)}>{children}</div> : null;

export const Tabs: React.FC<TabsProps> = ({ value, defaultValue, children, className, onValueChange }) => {
  const triggers: React.ReactElement<TabTriggerProps>[] = [];
  const contents: React.ReactElement<TabContentProps>[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if ((child.type as any).displayName === "TabsTrigger") triggers.push(child as React.ReactElement<TabTriggerProps>);
    if ((child.type as any).displayName === "TabsContent") contents.push(child as React.ReactElement<TabContentProps>);
  });

  const initialValue = value ?? defaultValue ?? triggers[0]?.props.value ?? "";
  const [activeValue, setActiveValue] = useState(initialValue);

  const handleClick = (val: string) => {
    setActiveValue(val);
    onValueChange?.(val);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex gap-2">
        {triggers.map((trigger) =>
          React.cloneElement<
            TabTriggerProps & { onClick?: () => void; active?: boolean }
          >(trigger, {
            onClick: () => handleClick(trigger.props.value),
            active: trigger.props.value === activeValue,
          })
        )}
      </div>

      {contents.map((content) =>
        React.cloneElement<
          TabContentProps & { active?: boolean }
        >(content, {
          active: content.props.value === activeValue,
        })
      )}
    </div>
  );
};

// Add displayName so we can type-check children
TabsTrigger.displayName = "TabsTrigger";
TabsContent.displayName = "TabsContent";
