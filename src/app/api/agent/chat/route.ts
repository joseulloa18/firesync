import { createChatHandler } from "@/lib/agent/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Covers the 60-second model budget and bounded audit operations.
export const maxDuration = 90;
export const POST = createChatHandler();
