import { notFound } from "next/navigation";
import { AgentChat } from "@/components/agent/chat";
import { agentMessages } from "@/components/agent/messages";

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "es" && locale !== "en") notFound();
  const t = agentMessages[locale];
  return (
    <>
      <section className="page-heading">
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </section>
      <AgentChat locale={locale} />
    </>
  );
}
