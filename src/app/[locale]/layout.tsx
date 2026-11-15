import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { AgentLauncher } from "@/components/agent/launcher";
import { dictionaries } from "@/components/messages";
import { parseConfig } from "@/lib/config";
import "../globals.css";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = dictionaries[locale === "en" ? "en" : "es"];
  return { title: t.brand, description: t.intro };
}
export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "es" && locale !== "en") notFound();
  parseConfig(process.env);
  return (
    <html lang={locale}>
      <body>
        <Suspense fallback={<p>{dictionaries[locale].loading}</p>}>
          <Shell locale={locale}>{children}</Shell>
          <AgentLauncher locale={locale} />
        </Suspense>
      </body>
    </html>
  );
}
