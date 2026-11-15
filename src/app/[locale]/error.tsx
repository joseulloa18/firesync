"use client";
import { useParams } from "next/navigation";
import { dictionaries } from "@/components/messages";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const params = useParams();
  const t = dictionaries[params.locale === "en" ? "en" : "es"];
  return (
    <section className="empty-card" role="alert">
      <h2>{t.error}</h2>
      <button className="button primary" onClick={reset}>
        {t.retry}
      </button>
    </section>
  );
}
