import React from "react";

type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "destructive";
};

export const Alert: React.FC<AlertProps> = ({
  variant = "default",
  className = "",
  ...props
}) => {
  const baseClasses =
    "relative w-full rounded-lg border px-4 py-3 text-sm grid grid-cols-[0_1fr] gap-y-0.5 items-start";
  const variantClasses =
    variant === "destructive"
      ? "bg-red-50 border-red-400 text-red-700"
      : "bg-gray-50 border-gray-300 text-gray-900";

  return (
    <div role="alert" className={`${baseClasses} ${variantClasses} ${className}`} {...props} />
  );
};

type AlertTitleProps = React.HTMLAttributes<HTMLDivElement>;

export const AlertTitle: React.FC<AlertTitleProps> = ({ className = "", ...props }) => (
  <div className={`col-start-2 font-medium tracking-tight ${className}`} {...props} />
);

type AlertDescriptionProps = React.HTMLAttributes<HTMLDivElement>;

export const AlertDescription: React.FC<AlertDescriptionProps> = ({ className = "", ...props }) => (
  <div className={`col-start-2 text-gray-700 text-sm mt-1 ${className}`} {...props} />
);
