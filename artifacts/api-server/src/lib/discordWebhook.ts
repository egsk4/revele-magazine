// PATH IN YOUR REPO: artifacts/api-server/src/lib/discordWebhook.ts
//
// Fire-and-forget Discord webhook notifier. Never throws, never blocks the response.

export function sendDiscordWebhook(url: string | undefined, content: string): void {
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  }).catch((err) => console.error("Discord webhook failed:", err));
}
