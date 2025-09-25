import React from "react";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "destructive" | "outline";
  asChild?: boolean;
  children: React.ReactNode;
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "default",
  asChild = false,
  className = "",
  children,
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 overflow-hidden focus-visible:ring-2 focus-visible:ring-offset-1";

  const variantClasses: Record<string, string> = {
    default: "border-transparent bg-blue-500 text-white hover:bg-blue-600 focus-visible:ring-blue-400",
    secondary: "border-transparent bg-gray-200 text-gray-800 hover:bg-gray-300 focus-visible:ring-gray-400",
    destructive: "border-transparent bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400",
    outline: "border border-gray-300 text-gray-800 hover:bg-gray-100 focus-visible:ring-gray-400",
  };

  const finalClasses = `${baseClasses} ${variantClasses[variant]} ${className}`;

  // Handle asChild logic
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return React.cloneElement(child, {
      ...child.props,
      ...props,
      className: [child.props.className, finalClasses].filter(Boolean).join(" "),
    });
  }

  // Default render
  return (
    <span className={finalClasses} {...props}>
      {children}
    </span>
  );
};
