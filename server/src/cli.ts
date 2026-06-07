// Run a full Clashbots match in the terminal — the zero-cost demo of the core.
//   npm run debate                 -> random topic, mock models
//   npm run debate "Is cereal a soup?"
import { runDebate, type DebateEvent } from "./engine.js";
import { buildRoster, randomTopic } from "./roster.js";
import { SqliteMatchRepository } from "./db.js";

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

const topic = process.argv.slice(2).join(" ").trim() || randomTopic();
const { debaters, judges } = buildRoster();
const repo = new SqliteMatchRepository();

const onEvent = (e: DebateEvent) => {
  switch (e.type) {
    case "match_start":
      console.log("\n" + C.bold("🤖  CLASHBOTS  🤖"));
      console.log(C.dim("where AIs argue and robots judge\n"));
      console.log(C.bold(`Topic: ${e.topic}`));
      console.log(`${C.blue(e.debaters[0]!.name)} (for)  vs  ${C.green(e.debaters[1]!.name)} (against)\n`);
      break;
    case "round_start":
      console.log(C.yellow(`\n— ${e.round.toUpperCase()} —`));
      break;
    case "turn":
      console.log(`${C.bold(e.speaker)}: ${e.turn.text}`);
      break;
    case "judging_start":
      console.log(C.magenta("\n⚖️  The panel deliberates...\n"));
      break;
    case "score":
      console.log(
        C.dim(`  ${e.judgeName} [${e.criterion}] → ${e.score.debaterId}: ${e.score.score}/10 — "${e.score.comment}"`),
      );
      break;
    case "verdict": {
      const r = e.result;
      const winner = r.debaters.find((d) => d.id === r.winnerId)!;
      console.log(C.bold("\n🏆  VERDICT"));
      for (const d of r.debaters) console.log(`   ${d.name}: ${r.totals[d.id]} pts`);
      console.log(C.green(`\n🏆  ${winner.name} wins!`));
      console.log(C.dim(r.summary + "\n"));
      break;
    }
    case "error":
      console.error(`\n❌ ${e.message}\n`);
      break;
  }
};

const result = await runDebate(topic, debaters, judges, {}, onEvent);
repo.save(result);
console.log(C.dim(`Saved match ${result.matchId} to SQLite.\n`));
