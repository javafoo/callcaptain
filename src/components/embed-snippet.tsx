"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardHeader, Icon } from "./ui";

/** The one line an owner pastes into their website: a "Talk to us now" button that calls their agent. */
export function EmbedSnippet({ workspace }: { workspace: string | null }) {
  const [origin, setOrigin] = useState("https://callcaptain.vercel.app");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOrigin(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);
  const snippet = `<script src="${origin}/embed.js"${workspace ? ` data-business="${workspace}"` : ""} async></script>`;

  return (
    <Card>
      <CardHeader
        title="Add the call button to your website"
        subtitle="Paste this one line before </body>. Visitors tap “Talk to us now”, talk to your agent and approve the PayPal hold, right on your site."
        action={
          <a href="/site" target="_blank" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-600">
            See it on a site <Icon name="external" className="h-3.5 w-3.5" />
          </a>
        }
      />
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-ink-900 px-4 py-3 font-mono text-xs text-brand-100">{snippet}</code>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(snippet).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
    </Card>
  );
}
