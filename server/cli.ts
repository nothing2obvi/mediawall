import { loadConfig } from "./config.js";

const mediaWallFallbackModes = ["centered", "breathing", "float", "spotlight", "dvd", "minimal"] as const;
const backdropAnimations = ["breathe", "pan", "kenburns", "drift", "focus", "zoom"] as const;
const usage = [
  "Usage:",
  "  npm run mediawall -- animation <animation_name> on <space>",
  "  npm run mediawall -- animation <animation_name> --random on <space>",
  "  npm run mediawall -- animation all on <space>",
  "  npm run mediawall -- animation all --random on <space>",
  "  npm run mediawall -- play sound <sound_name> on <space>",
  "  npm run mediawall -- play sound All on <space>",
  "  npm run mediawall -- play sounds All on <space>",
  "  npm run mediawall -- play <sound_name> on <space>",
  "  npm run mediawall -- play mediawall <screensaver_name> on <space>",
  "  npm run mediawall -- play media wall <screensaver_name> on <space>",
  "  npm run mediawall -- play screensaver <screensaver_name> on <space>",
  "  npm run mediawall -- play user transition on <space>",
  "  npm run mediawall -- play user transition <display_name> on <space>",
  "  npm run mediawall -- play <screensaver_name> on <space>"
].join("\n");

type CommandType = "sound" | "mediawall" | "animation" | "user_transition";

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
      durationSeconds: parsed.type === "sound" ? 15 : 30,
      randomBackdrop: parsed.randomBackdrop
    })
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(body);
    process.exit(1);
  }
  console.log(`Playing ${parsed.type === "mediawall" ? "MediaWall fallback" : parsed.type === "user_transition" ? "user transition" : parsed.type} "${parsed.name}" on /${parsed.space}.`);
}

function parseArgs(args: string[]):
  | { ok: true; type: CommandType; name: string; space: string; randomBackdrop?: boolean }
  | { ok: false; error: string } {
  if (args[0]?.toLowerCase() === "animation") return parseAnimationArgs(args.slice(1));
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
  if (first === "user" && second === "transition") {
    type = "user_transition";
    nameParts.splice(0, 2);
  }
  const command = nameParts[0]?.toLowerCase();
  if (command === "sound" || command === "sounds" || command === "mediawall") {
    type = command === "sounds" ? "sound" : command as CommandType;
    nameParts.shift();
  } else if (command === "screensaver") {
    type = "mediawall";
    nameParts.shift();
  } else if (command === "user-transition" || command === "user_transition") {
    type = "user_transition";
    nameParts.shift();
  } else if (command === "animation" || command === "animations") {
    type = "animation";
    nameParts.shift();
  }
  const name = nameParts.join(" ").trim() || (type === "user_transition" ? "test" : "");
  if (!name) return { ok: false, error: "Missing sound or MediaWall fallback name." };
  const inferredType = backdropAnimations.includes(name.toLowerCase() as typeof backdropAnimations[number]) || name.toLowerCase() === "all"
    ? "animation"
    : mediaWallFallbackModes.includes(name as typeof mediaWallFallbackModes[number])
    ? "mediawall"
    : "sound";
  return { ok: true, type: type ?? inferredType, name, space };
}

function parseAnimationArgs(args: string[]):
  | { ok: true; type: "animation"; name: string; space: string; randomBackdrop?: boolean }
  | { ok: false; error: string } {
  const onIndex = args.findIndex((arg) => arg.toLowerCase() === "on");
  if (onIndex < 1 || onIndex === args.length - 1) return { ok: false, error: "Animation command must include a name and space." };
  const nameParts = args.slice(0, onIndex);
  const randomIndex = nameParts.findIndex((arg) => arg.toLowerCase() === "--random");
  const randomBackdrop = randomIndex >= 0;
  if (randomIndex >= 0) nameParts.splice(randomIndex, 1);
  const name = nameParts.join(" ").trim();
  if (!name) return { ok: false, error: "Missing animation name." };
  return { ok: true, type: "animation", name, space: args[onIndex + 1], randomBackdrop };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
