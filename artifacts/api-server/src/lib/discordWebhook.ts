// PATH IN YOUR REPO: artifacts/api-server/src/lib/discordWebhook.ts
//
// Fire-and-forget Discord webhook notifier. Never throws, never blocks the response.

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export function sendDiscordWebhook(url: string | undefined, embed: DiscordEmbed): void {
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch((err) => console.error("Discord webhook failed:", err));
}
