import React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

export const Input: React.FC<InputProps> = ({ className, type = "text", ...props }) => {
  return (
    <input
      type={type}
      className={cn(
        "placeholder:text-gray-400 selection:bg-blue-500 selection:text-white border border-gray-300 h-9 w-full min-w-0 rounded-md bg-white px-3 py-1 text-base shadow-sm transition-colors outline-none",
        "focus:ring-2 focus:ring-offset-1 focus:ring-blue-400",
        props.disabled ? "opacity-50 cursor-not-allowed" : "",
        className
      )}
      {...props}
    />
  );
};
