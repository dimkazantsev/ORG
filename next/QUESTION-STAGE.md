# Question stage
The question is the focus: illustration, question, choices, then team progress. Existing Manrope and the white/lavender palette remain shared across the product. Large timer figures support the classroom projector; phones retain touch-sized answer controls. Fifteen habitat silhouettes keep stable colors and positions between questions and result screens. Motion belongs to the frame, countdown, segment fill and answer reveal. Reduced-motion mode preserves every result without decorative movement. No scores or correct answers are manufactured in the browser.

The server owns question → result → next question/card/finale. Both public-screen and authorized participant state reads release expired stages under a room row lock. Public callers cannot release an unexpired stage or invoke the internal transition function. Moderator Next reveals a question early, then advances the result. Answer duration is 5–30 seconds, default 10.

Every question snapshots its eligible roster and start/deadline. Team response time is the mean of all eligible participants' elapsed times; unanswered participants receive the full question duration. Comparison normalizes each elapsed time by that question's duration. Speed delta = 100 × (previous normalized mean / current normalized mean − 1). First results, empty teams and undefined baselines show a dash. A team of 3 and a team of 6 receive the same mean for identical per-person timing.

Individual order: total points descending, latest correct answer before incorrect/unanswered, latest correct elapsed time ascending, then mean normalized correct time and stable join order. Final question summaries include accuracy, errors and unanswered counts; polls are excluded from knowledge summaries. Most-missed questions sort by actual error rate, with unanswered participants shown separately.

All answer keys remain server-side during the question. Public results expose a prepared answer display only after reveal, plus nicknames and aggregate statistics. Internal timing tables have RLS and no client table grants. Defaults are unusual single-adjective team names; captain editing belongs to the next iteration.

Audio uses a single lazily-created Web Audio context, short sine chimes, bounded voices, explicit mute/volume and visual equivalents. A browser gesture is required to enable sound on each device. Countdown ticks are deduplicated; background tabs do not play catch-up sounds.

Run: node --test next/test.mjs
Browser checks: npx playwright test next/visual.spec.mjs next/stage.spec.mjs --workers=1
Database checks: execute next/question-stage-check.sql in a test transaction. The script rolls back its fixtures.
Browser fixtures validate UI with 15 teams and 40 names; this is not a 40-device load test.
