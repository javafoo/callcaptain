import { Icon } from "@/components/ui";
import { Container } from "./primitives";
import { SOURCES } from "./sources";

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** Footnotes for every number on the page. Each item is a #source-N anchor target. */
export function SourcesList() {
  return (
    <section aria-labelledby="sources-title" className="border-t border-gray-200 bg-[#f4f6f8] py-14">
      <Container>
        <h2 id="sources-title" className="text-sm font-semibold text-gray-900">
          Sources
        </h2>
        <ol className="mt-4 grid grid-cols-1 gap-x-10 gap-y-1 text-sm text-gray-600 md:grid-cols-2">
          {SOURCES.map((s, i) => (
            <li key={s.key} id={`source-${i + 1}`} className="flex scroll-mt-24 gap-2 rounded-lg px-2 py-1.5 transition target:bg-amber-50 target:ring-1 target:ring-amber-200">
              <span className="w-5 shrink-0 text-right text-gray-500 tabular-nums">{i + 1}.</span>
              <span className="min-w-0">
                {s.cite}{" "}
                <a href={s.url} className="inline-flex items-center gap-1 font-medium break-all text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-700">
                  {host(s.url)}
                  <Icon name="external" className="h-3 w-3 shrink-0" />
                </a>
              </span>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
