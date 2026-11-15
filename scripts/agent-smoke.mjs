// Prueba manual, una sola llamada pequeña. No muestra clave ni respuesta cruda.
if (!process.argv.includes("--live")) {
  console.error(
    "Prueba no ejecutada. Usa --live para verificar la API de Meta.",
  );
  process.exitCode = 1;
} else {
  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.MODEL_API_KEY ||
    process.env.META_API_KEY;
  const model = process.env.LLM_MODEL || "muse-spark-1.3";
  const allowed = [
    "muse-spark-1.3",
    "muse-spark-1.2",
    "muse-spark-1.1",
    "muse-ember-1.0",
    "muse-wonder-1.0",
  ];
  if (!apiKey || !allowed.includes(model)) {
    console.error(
      "META_CONFIG_REQUIRED: configura una clave y un modelo Muse estándar en el entorno del servidor.",
    );
    process.exitCode = 1;
  } else {
    try {
      const response = await fetch("https://api.meta.ai/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "user", content: "Reply with the single word: ready" },
          ],
          max_completion_tokens: 128,
          reasoning_effort: "minimal",
          store: false,
          stream: false,
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        console.error(
          JSON.stringify({ status: "failed", httpStatus: response.status }),
        );
        process.exitCode = 1;
      } else {
        const value = await response.json();
        const answer = value?.choices?.[0]?.message?.content;
        const ready =
          typeof answer === "string" &&
          answer.trim().replace(/[.!]$/, "").toLowerCase() === "ready";
        console.log(
          JSON.stringify({
            status: ready ? "verified" : "unexpected_response",
            provider: "meta",
            model,
            authentication: "accepted",
            ...(Number.isInteger(value?.usage?.total_tokens)
              ? { totalTokens: value.usage.total_tokens }
              : {}),
          }),
        );
        if (!ready) process.exitCode = 1;
      }
    } catch {
      console.error(
        JSON.stringify({ status: "unverified", code: "NETWORK_OR_TIMEOUT" }),
      );
      process.exitCode = 1;
    }
  }
}
