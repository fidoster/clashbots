import { Fragment } from "react";
import type { Debater, JudgeScore } from "./types.js";

const getFrontEmoji = (criterion: string): string => {
  const norm = criterion.toLowerCase();
  if (norm.includes("logic") || norm.includes("evidence")) return "🧠"; // Logic & Evidence
  if (norm.includes("rhetoric") || norm.includes("style")) return "🗣️"; // Rhetoric & Style
  if (norm.includes("accuracy") || norm.includes("rigor")) return "🔬"; // Accuracy & Rigor
  if (norm.includes("persuasiveness") || norm.includes("appeal")) return "🤝"; // Persuasiveness
  if (norm.includes("funny") || norm.includes("humor") || norm.includes("funny")) return "🃏"; // Humorous
  return "⚖️"; // Default / custom criteria
};

interface JudgeMeta {
  id: string;
  emoji: string;
  criterion: string;
}

/** Boxing-style scorecard shown at the verdict: per-criterion scores, the judge's
 *  reasoning for each side, the round winner, and the final point totals. */
export function ScoreCard(props: {
  judges: JudgeMeta[];
  scores: JudgeScore[];
  debaters: Debater[];
  totals: Record<string, number>;
  winnerId: string;
  judgeLabel: string;
  mockJudging: boolean;
}) {
  const { judges, scores, debaters, totals, winnerId, judgeLabel, mockJudging } = props;
  const blue = debaters.find((d) => d.side === "for");
  const green = debaters.find((d) => d.side === "against");
  if (!blue || !green) return null;

  const get = (jid: string, did: string) => scores.find((s) => s.judgeId === jid && s.debaterId === did);
  const maxPoints = judges.length * 10;

  return (
    <div className="scorecard">
      <div className="sc-title">📊 OFFICIAL SCORECARD</div>
      <div className="sc-grid">
        <div className="sc-head">Criterion</div>
        <div className={`sc-head blue ${winnerId === blue.id ? "win" : ""}`}>{blue.name}</div>
        <div className={`sc-head green ${winnerId === green.id ? "win" : ""}`}>{green.name}</div>
        <div className="sc-head center">Round to</div>

        {judges.map((j) => {
          const sb = get(j.id, blue.id);
          const sg = get(j.id, green.id);
          const won = sb?.judgeWinnerId ?? sg?.judgeWinnerId;
          const roundTo = won === blue.id ? blue.name : won === green.id ? green.name : "Tie";
          return (
            <Fragment key={j.id}>
              <div className="sc-crit">
                <span className="sc-emoji">{j.emoji || getFrontEmoji(j.criterion)}</span>
                <span className="sc-critname">{j.criterion}</span>
              </div>
              <div className={`sc-cell blue ${won === blue.id ? "won" : ""}`}>
                <span className="sc-score">{sb?.score ?? "–"}</span>
                <span className="sc-reason">{sb?.comment}</span>
              </div>
              <div className={`sc-cell green ${won === green.id ? "won" : ""}`}>
                <span className="sc-score">{sg?.score ?? "–"}</span>
                <span className="sc-reason">{sg?.comment}</span>
              </div>
              <div className={`sc-round center ${won === blue.id ? "blue" : won === green.id ? "green" : ""}`}>
                {roundTo}
              </div>
            </Fragment>
          );
        })}

        <div className="sc-total-label">TOTAL</div>
        <div className={`sc-total blue ${winnerId === blue.id ? "win" : ""}`}>
          {totals[blue.id]} <small>/ {maxPoints}</small>
        </div>
        <div className={`sc-total green ${winnerId === green.id ? "win" : ""}`}>
          {totals[green.id]} <small>/ {maxPoints}</small>
        </div>
        <div className="sc-round center final">
          {winnerId === "tie" ? "🤝 Draw" : `🏆 ${winnerId === blue.id ? blue.name : green.name}`}
        </div>
      </div>

      <div className={`sc-foot ${mockJudging ? "warn" : "real"}`}>
        {mockJudging
          ? "⚠️ Demo scoring — judges are simulated (mock). Set the Judge panel to a real model in ⚙️ Settings for genuine LLM analysis of the arguments."
          : `⚖️ Judged by ${judgeLabel} — each criterion scored by the model from the full transcript.`}
      </div>
    </div>
  );
}
