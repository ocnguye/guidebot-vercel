import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
  children: React.ReactNode;
};

export const Button: React.FC<ButtonProps> = ({
  variant = "default",
  size = "default",
  asChild = false,
  className = "",
  children,
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

  const variantClasses: Record<string, string> = {
    default: "bg-blue-500 text-white hover:bg-blue-600",
    destructive: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400",
    outline: "border bg-white shadow-sm hover:bg-gray-100",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
    ghost: "bg-transparent hover:bg-gray-100",
    link: "text-blue-500 underline hover:text-blue-600",
  };

  const sizeClasses: Record<string, string> = {
    default: "h-9 px-4 py-2",
    sm: "h-8 px-3 gap-1.5",
    lg: "h-10 px-6",
    icon: "h-9 w-9 p-0",
  };

  const finalClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return React.cloneElement(child, {
      ...child.props,
      ...props,
      className: [child.props.className, finalClasses].filter(Boolean).join(" "),
    });
  }

  return (
    <button className={finalClasses} {...props}>
      {children}
    </button>
  );
};
