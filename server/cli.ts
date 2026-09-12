import { loadConfig } from "./config.js";

const mediaWallFallbackModes = ["centered", "breathing", "float", "spotlight", "dvd", "minimal"] as const;
const usage = [
  "Usage:",
  "  npm run mediawall -- play sound <sound_name> on <space>",
  "  npm run mediawall -- play sound All on <space>",
  "  npm run mediawall -- play sounds All on <space>",
  "  npm run mediawall -- play <sound_name> on <space>",
  "  npm run mediawall -- play mediawall <screensaver_name> on <space>",
  "  npm run mediawall -- play media wall <screensaver_name> on <space>",
  "  npm run mediawall -- play screensaver <screensaver_name> on <space>",
  "  npm run mediawall -- play <screensaver_name> on <space>"
].join("\n");

type CommandType = "sound" | "mediawall";

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    console.error(usage);
    process.exit(1);
  }

  const config = loadConfig();
  const space = config.spaces[parsed.space];
  if (!space) {
    console.error(`Unknown space "${parsed.space}".`);
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? config.server.port ?? 1221);
  const url = new URL(`/api/space/${encodeURIComponent(parsed.space)}/command`, `http://127.0.0.1:${port}`);
  if (space.password) url.searchParams.set("password", space.password);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: parsed.type,
      name: parsed.name,
      durationSeconds: parsed.type === "mediawall" ? 30 : 15
    })
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(body);
    process.exit(1);
  }
  console.log(`Playing ${parsed.type === "mediawall" ? "MediaWall fallback" : "sound"} "${parsed.name}" on /${parsed.space}.`);
}

function parseArgs(args: string[]):
  | { ok: true; type: CommandType; name: string; space: string }
  | { ok: false; error: string } {
  if (args[0] !== "play") return { ok: false, error: "Command must start with play." };
  const onIndex = args.findIndex((arg) => arg.toLowerCase() === "on");
  if (onIndex < 2 || onIndex === args.length - 1) return { ok: false, error: "Command must include a name and space." };
  const space = args[onIndex + 1];
  const nameParts = args.slice(1, onIndex);
  let type: CommandType | undefined;
  const first = nameParts[0]?.toLowerCase();
  const second = nameParts[1]?.toLowerCase();
  if (first === "media" && second === "wall") {
    type = "mediawall";
    nameParts.splice(0, 2);
  }
  const command = nameParts[0]?.toLowerCase();
  if (command === "sound" || command === "sounds" || command === "mediawall") {
    type = command === "sounds" ? "sound" : command as CommandType;
    nameParts.shift();
  } else if (command === "screensaver") {
    type = "mediawall";
    nameParts.shift();
  }
  const name = nameParts.join(" ").trim();
  if (!name) return { ok: false, error: "Missing sound or MediaWall fallback name." };
  const inferredType = mediaWallFallbackModes.includes(name as typeof mediaWallFallbackModes[number])
    ? "mediawall"
    : "sound";
  return { ok: true, type: type ?? inferredType, name, space };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
