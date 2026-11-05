import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function SmartLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return to.startsWith("/") ? (
    <Link to={to} className={className}>{children}</Link>
  ) : (
    <a href={to} className={className} rel="noopener noreferrer" target="_blank">{children}</a>
  );
}
