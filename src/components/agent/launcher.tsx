import Link from "next/link";
import { agentMessages } from "./messages";
import "./chat.css";

export function AgentLauncher({ locale }: { locale: "es" | "en" }) {
  return (
    <Link
      className="agent-launcher"
      href={`/${locale}/asistente`}
      aria-label={agentMessages[locale].open}
    >
      <span aria-hidden="true">✦</span> {agentMessages[locale].title}
    </Link>
  );
}
