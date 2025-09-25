import React from "react";
import { cn } from "@/lib/utils";

type ProgressProps = {
  value?: number; // 0–100
  className?: string;
};

export const Progress: React.FC<ProgressProps> = ({ value = 0, className }) => {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        "bg-gray-200 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
    >
      <div
        className="bg-blue-500 h-full transition-all"
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
};
