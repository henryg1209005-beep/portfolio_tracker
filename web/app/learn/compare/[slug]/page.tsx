import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getMetric } from "@/lib/metrics-data";
import { METRIC_COMPARISONS, getMetricComparison } from "@/lib/metric-comparisons";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return METRIC_COMPARISONS.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = getMetricComparison(slug);
  if (!item) return {};

  return {
    title: `${item.title} | Portivex Learn`,
    description: item.metaDescription,
    alternates: { canonical: `https://portivex.co.uk/learn/compare/${item.slug}` },
    openGraph: {
      title: `${item.title} | Portivex Learn`,
      description: item.metaDescription,
      url: `https://portivex.co.uk/learn/compare/${item.slug}`,
      siteName: "Portivex",
      type: "article",
    },
  };
}

function JsonLd({ slug, title, description, faqs }: { slug: string; title: string; description: string; faqs: Array<{ q: string; a: string }> }) {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url: `https://portivex.co.uk/learn/compare/${slug}`,
    publisher: {
      "@type": "Organization",
      name: "Portivex",
      url: "https://portivex.co.uk",
    },
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://portivex.co.uk/" },
      { "@type": "ListItem", position: 2, name: "Metric Library", item: "https://portivex.co.uk/learn" },
      { "@type": "ListItem", position: 3, name: "Comparisons", item: "https://portivex.co.uk/learn/compare" },
      { "@type": "ListItem", position: 4, name: title, item: `https://portivex.co.uk/learn/compare/${slug}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }} />
    </>
  );
}

export default async function LearnComparisonPage({ params }: Props) {
  const { slug } = await params;
  const item = getMetricComparison(slug);
  if (!item) notFound();

  const primary = getMetric(item.primaryMetricSlug);
  const secondary = getMetric(item.secondaryMetricSlug);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080012", color: "#e2d9f3" }}>
      <JsonLd slug={item.slug} title={item.title} description={item.metaDescription} faqs={item.faqs} />

      <nav
        className="sticky top-0 z-50"
        style={{
          background: "linear-gradient(180deg,#080012ee,#080012aa)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1a0030",
        }}
      >
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/learn/compare" className="text-sm font-medium" style={{ color: "#6b5e7e" }}>
              Back to comparisons
            </Link>
            <Link href="/">
              <Image src="/logo.png" alt="Portivex" width={120} height={40} className="object-contain" />
            </Link>
          </div>
          <Link
            href="/sign-up"
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
          >
            Start free
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12 w-full flex-1">
        <nav className="text-xs font-mono mb-8" style={{ color: "#4a3a5e" }} aria-label="Breadcrumb">
          <Link href="/" className="hover:underline" style={{ color: "#6b5e7e" }}>Home</Link>
          <span className="mx-2">/</span>
          <Link href="/learn" className="hover:underline" style={{ color: "#6b5e7e" }}>Metric Library</Link>
          <span className="mx-2">/</span>
          <Link href="/learn/compare" className="hover:underline" style={{ color: "#6b5e7e" }}>Comparisons</Link>
          <span className="mx-2">/</span>
          <span>{item.shortTitle}</span>
        </nav>

        <header className="mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono mb-4 uppercase tracking-widest"
            style={{ background: "#bf5af211", border: "1px solid #bf5af233", color: "#bf5af2" }}
          >
            Side-by-side metric guide
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">{item.title}</h1>
          <p className="text-lg leading-relaxed" style={{ color: "#8a7a9e" }}>{item.summary}</p>
        </header>

        <section className="mb-8 rounded-xl p-5" style={{ background: "#0d0020", border: "1px solid #2a0050" }}>
          <h2 className="text-xl font-semibold mb-3">When to use each</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl p-4" style={{ background: "#10001d", border: "1px solid #1a0030" }}>
              <p className="text-xs font-mono mb-2 uppercase tracking-widest" style={{ color: "#00f5d4" }}>
                {primary?.shortName ?? "Primary metric"}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#b0a0c8" }}>{item.whenToUsePrimary}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "#10001d", border: "1px solid #1a0030" }}>
              <p className="text-xs font-mono mb-2 uppercase tracking-widest" style={{ color: "#ff2d78" }}>
                {secondary?.shortName ?? "Secondary metric"}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#b0a0c8" }}>{item.whenToUseSecondary}</p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Key differences</h2>
          <div className="space-y-3">
            {item.keyDifferences.map((row) => (
              <div key={row.label} className="rounded-xl p-4" style={{ background: "#0d0020", border: "1px solid #1a0030" }}>
                <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: "#6b5e7e" }}>{row.label}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <p className="text-sm" style={{ color: "#b0a0c8" }}>{row.primary}</p>
                  <p className="text-sm" style={{ color: "#b0a0c8" }}>{row.secondary}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Common pitfalls</h2>
          <ul className="space-y-2">
            {item.pitfalls.map((pitfall) => (
              <li key={pitfall} className="flex items-start gap-3 text-sm leading-relaxed" style={{ color: "#b0a0c8" }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#bf5af2" }} />
                {pitfall}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10 rounded-xl p-5" style={{ background: "linear-gradient(135deg,#120020,#0a0014)", border: "1px solid #bf5af244" }}>
          <h2 className="text-xl font-semibold mb-3">Practical decision rule</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#b0a0c8" }}>{item.decisionRule}</p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-5">Frequently asked questions</h2>
          <div className="space-y-4">
            {item.faqs.map((faq) => (
              <details key={faq.q} className="rounded-xl overflow-hidden" style={{ background: "#0d0020", border: "1px solid #2a0050" }}>
                <summary className="px-5 py-4 text-sm font-medium cursor-pointer select-none" style={{ color: "#e2d9f3" }}>
                  {faq.q}
                </summary>
                <div className="px-5 pb-4 pt-1 text-sm leading-relaxed" style={{ color: "#8a7a9e" }}>
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        <div className="rounded-2xl p-8 text-center" style={{ background: "linear-gradient(130deg,#120020,#0d0018)", border: "1px solid #2a0050" }}>
          <h2 className="text-xl font-bold mb-2">See these metrics on your own portfolio.</h2>
          <p className="text-sm mb-5" style={{ color: "#8a7a9e" }}>
            Portivex calculates both metrics side by side so you can make decisions with clearer risk context.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex px-8 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff", boxShadow: "0 0 26px #bf5af244" }}
          >
            Analyse my portfolio
          </Link>
        </div>
      </main>
    </div>
  );
}
