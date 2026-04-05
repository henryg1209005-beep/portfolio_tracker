import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { METRICS, getMetric, getRelatedMetrics } from "@/lib/metrics-data";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return METRICS.map((metric) => ({ slug: metric.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const metric = getMetric(slug);
  if (!metric) return {};

  return {
    title: `${metric.name} Explained: Formula, Interpretation & Benchmarks | Portivex`,
    description: metric.metaDescription,
    alternates: { canonical: `https://portivex.co.uk/learn/${metric.slug}` },
    openGraph: {
      title: `${metric.name} Explained | Portivex`,
      description: metric.metaDescription,
      url: `https://portivex.co.uk/learn/${metric.slug}`,
      siteName: "Portivex",
      type: "article",
    },
  };
}

function JsonLd({ metric }: { metric: ReturnType<typeof getMetric> }) {
  if (!metric) return null;

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${metric.name} Explained: Formula, Interpretation & Benchmarks`,
    description: metric.metaDescription,
    url: `https://portivex.co.uk/learn/${metric.slug}`,
    publisher: {
      "@type": "Organization",
      name: "Portivex",
      url: "https://portivex.co.uk",
    },
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: metric.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://portivex.co.uk/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Metric Library",
        item: "https://portivex.co.uk/learn",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: metric.name,
        item: `https://portivex.co.uk/learn/${metric.slug}`,
      },
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

export default async function MetricDetailPage({ params }: Props) {
  const { slug } = await params;
  const metric = getMetric(slug);
  if (!metric) notFound();

  const related = getRelatedMetrics(metric);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080012", color: "#e2d9f3" }}>
      <JsonLd metric={metric} />

      {/* Nav */}
      <nav
        className="sticky top-0 z-50"
        style={{
          background: "linear-gradient(180deg,#080012ee,#080012aa)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1a0030",
        }}
      >
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <Image src="/logo.png" alt="Portivex" width={120} height={40} className="object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/learn" className="hidden sm:block text-sm" style={{ color: "#6b5e7e" }}>
              ← All metrics
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
            >
              Start free →
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12 w-full flex-1">
        {/* Breadcrumb */}
        <nav className="text-xs font-mono mb-8" style={{ color: "#4a3a5e" }} aria-label="Breadcrumb">
          <Link href="/" className="hover:underline" style={{ color: "#6b5e7e" }}>Home</Link>
          <span className="mx-2">/</span>
          <Link href="/learn" className="hover:underline" style={{ color: "#6b5e7e" }}>Metric Library</Link>
          <span className="mx-2">/</span>
          <span>{metric.name}</span>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono mb-4 uppercase tracking-widest"
            style={{ background: `${metric.accent}11`, border: `1px solid ${metric.accent}33`, color: metric.accent }}
          >
            {metric.shortName}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            {metric.name} Explained
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: "#8a7a9e" }}>{metric.tagline}</p>
        </header>

        {/* Formula */}
        <section className="rounded-xl p-5 mb-8" style={{ background: "#0d0020", border: `1px solid ${metric.accent}33` }}>
          <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: "#4a3a5e" }}>Formula</div>
          <div className="text-2xl font-mono font-semibold mb-2" style={{ color: metric.accent }}>
            {metric.formula}
          </div>
          <p className="text-sm" style={{ color: "#6b5e7e" }}>{metric.formulaDescription}</p>
        </section>

        {/* What it is */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">What is the {metric.name}?</h2>
          <p className="text-base leading-relaxed" style={{ color: "#b0a0c8" }}>{metric.whatItIs}</p>
        </section>

        {/* How to interpret */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">How to interpret it</h2>
          <p className="text-base leading-relaxed" style={{ color: "#b0a0c8" }}>{metric.howToInterpret}</p>
        </section>

        {/* Good range */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">What counts as a good {metric.shortName}?</h2>
          <div className="space-y-2">
            {metric.goodRange.map((band) => (
              <div
                key={band.label}
                className="flex items-start gap-4 rounded-xl p-4"
                style={{ background: "#0d0020", border: "1px solid #1a0030" }}
              >
                <span
                  className="shrink-0 text-sm font-mono font-semibold min-w-[72px]"
                  style={{ color: metric.accent }}
                >
                  {band.label}
                </span>
                <span className="text-sm leading-relaxed" style={{ color: "#8a7a9e" }}>{band.description}</span>
              </div>
            ))}
          </div>
        </section>

        {/* What affects it */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">What affects your {metric.shortName}?</h2>
          <ul className="space-y-2">
            {metric.whatAffectsIt.map((factor) => (
              <li key={factor} className="flex items-start gap-3 text-sm leading-relaxed" style={{ color: "#b0a0c8" }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: metric.accent }} />
                {factor}
              </li>
            ))}
          </ul>
        </section>

        {/* How Portivex uses it */}
        <section className="rounded-xl p-5 mb-10" style={{ background: "linear-gradient(135deg,#120020,#0a0014)", border: `1px solid ${metric.accent}44` }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full" style={{ color: metric.accent, background: `${metric.accent}11`, border: `1px solid ${metric.accent}22` }}>
              How Portivex uses {metric.shortName}
            </span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "#b0a0c8" }}>{metric.howPortivexUses}</p>
          <Link
            href="/sign-up"
            className="inline-flex mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff" }}
          >
            See my {metric.shortName} →
          </Link>
        </section>

        {/* FAQs */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-5">Frequently asked questions</h2>
          <div className="space-y-4">
            {metric.faqs.map((faq) => (
              <details
                key={faq.q}
                className="rounded-xl overflow-hidden"
                style={{ background: "#0d0020", border: "1px solid #2a0050" }}
              >
                <summary
                  className="px-5 py-4 text-sm font-medium cursor-pointer select-none"
                  style={{ color: "#e2d9f3" }}
                >
                  {faq.q}
                </summary>
                <div className="px-5 pb-4 pt-1 text-sm leading-relaxed" style={{ color: "#8a7a9e" }}>
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Related metrics */}
        {related.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-4">Related metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {related.map((rel) => (
                <Link
                  key={rel.slug}
                  href={`/learn/${rel.slug}`}
                  className="rounded-xl p-3 text-center transition-all hover:scale-[1.02]"
                  style={{ background: "#0d0020", border: `1px solid ${rel.accent}33` }}
                >
                  <div className="text-xs font-mono font-semibold mb-1" style={{ color: rel.accent }}>
                    {rel.shortName}
                  </div>
                  <div className="text-xs" style={{ color: "#6b5e7e" }}>{rel.name}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Bottom CTA */}
        <div className="rounded-2xl p-8 text-center" style={{ background: "linear-gradient(130deg,#120020,#0d0018)", border: "1px solid #2a0050" }}>
          <h2 className="text-xl font-bold mb-2">
            See your {metric.name} in real time.
          </h2>
          <p className="text-sm mb-5" style={{ color: "#8a7a9e" }}>
            Add your holdings and Portivex calculates your {metric.shortName} — with confidence context
            and plain-English interpretation tailored to your investor profile.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex px-8 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "linear-gradient(90deg,#bf5af2,#ff2d78)", color: "#fff", boxShadow: "0 0 26px #bf5af244" }}
          >
            Analyse my portfolio →
          </Link>
          <p className="text-xs mt-3 font-mono" style={{ color: "#4a3a5e" }}>Free during early access · No card required</p>
        </div>
      </main>

      <footer className="px-6 py-8 border-t" style={{ borderColor: "#1a0030" }}>
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "#4a3a5e" }}>Portivex - Portfolio Risk Intelligence Platform</p>
          <Link href="/learn" className="text-xs" style={{ color: "#bf5af2" }}>← Metric Library</Link>
          <p className="text-xs" style={{ color: "#2a1a40" }}>For informational purposes only. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}
