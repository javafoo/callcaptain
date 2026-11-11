import Link from "next/link";
import { Fragment, type ComponentProps, type ReactNode } from "react";
import { Icon, cx } from "@/components/ui";
import { SOURCES, sourceNumber, type SourceKey } from "./sources";

/** Shared building blocks for the public site: one container width, one heading style, one button style. */

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("flex items-center gap-2.5", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
        <Icon name="shield" className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-white">Call Captain</span>
    </span>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  dark = false,
  center = false,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  dark?: boolean;
  center?: boolean;
}) {
  return (
    <div className={cx("max-w-3xl", center && "mx-auto text-center")}>
      <p className={cx("text-sm font-semibold", dark ? "text-brand-500" : "text-brand-700")}>{eyebrow}</p>
      <h2 id={id} className={cx("mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl", dark ? "text-white" : "text-gray-900")}>
        {title}
      </h2>
      {lead && <p className={cx("mt-4 text-lg text-pretty", dark ? "text-ink-300" : "text-gray-600")}>{lead}</p>}
    </div>
  );
}

const BUTTON = {
  // brand-700 keeps white text above 4.5:1; hover goes one step darker.
  primary: "bg-brand-700 text-white shadow-sm hover:bg-[#05603a]",
  light: "bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50",
  dark: "bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/15",
};

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof BUTTON;
  size?: "md" | "lg";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition",
        size === "lg" ? "px-5 py-3 text-base" : "px-3.5 py-2 text-sm",
        BUTTON[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Footnote marker(s) that jump to the Sources list. */
export function Cite({ source }: { source: SourceKey | SourceKey[] }) {
  const keys = Array.isArray(source) ? source : [source];
  return (
    <sup className="ml-0.5 font-medium">
      {keys.map((key, i) => {
        const n = sourceNumber(key);
        return (
          <Fragment key={key}>
            {i > 0 && ", "}
            <a
              href={`#source-${n}`}
              title={SOURCES[n - 1].cite}
              aria-label={`Source ${n}`}
              className="rounded-sm px-px text-current underline decoration-dotted underline-offset-2 opacity-75 transition hover:opacity-100"
            >
              {n}
            </a>
          </Fragment>
        );
      })}
    </sup>
  );
}

/** A small mono label for the PayPal API behind a money moment. */
export function ApiTag({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <p className={cx("font-mono text-[11px] leading-5", dark ? "text-ink-300" : "text-gray-500")}>{children}</p>;
}
