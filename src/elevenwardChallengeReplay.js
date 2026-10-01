import { spawn } from "node:child_process";

// Only a deployment-configured executable is used. No request value is passed
// as a command, argument, environment variable or filesystem path.
let activeReplays = 0;
export async function replayWeeklyChallenge(
  input,
  {
    executable = process.env.ELEVENWARD_REPLAY_EXECUTABLE,
    timeoutMs = 10000,
  } = {},
) {
  if (!executable || activeReplays >= 4) {
    const error = new Error("Challenge verifier unavailable");
    error.code = "REPLAY_UNAVAILABLE";
    throw error;
  }
  activeReplays++;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { PATH: process.env.PATH },
      });
      let output = "",
        stderr = "",
        done = false;
      const fail = (code, message) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        const error = new Error(message);
        error.code = code;
        reject(error);
      };
      const timer = setTimeout(
        () => fail("REPLAY_UNAVAILABLE", "Challenge verifier timed out"),
        timeoutMs,
      );
      child.on("error", () =>
        fail("REPLAY_UNAVAILABLE", "Challenge verifier unavailable"),
      );
      child.stdout.on("data", (bytes) => {
        output += bytes;
        if (Buffer.byteLength(output) > 64000)
          fail("REPLAY_INVALID", "Oversized replay response");
      });
      child.stderr.on("data", (bytes) => {
        stderr += bytes;
        if (Buffer.byteLength(stderr) > 8000)
          fail("REPLAY_INVALID", "Oversized replay error");
      });
      child.on("close", (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (code !== 0) {
          const error = new Error("Replay rejected");
          error.code = "REPLAY_INVALID";
          reject(error);
          return;
        }
        try {
          const result = JSON.parse(output);
          if (
            result.valid !== true ||
            result.complete !== true ||
            !Number.isInteger(result.score) ||
            result.score < 0 ||
            result.score > 10000000 ||
            result.matchCount !== 8 ||
            result.rulesVersion !== input.rulesVersion ||
            result.contentVersion !== input.contentVersion
          )
            throw new Error("Invalid verifier output");
          resolve({ score: result.score });
        } catch {
          const error = new Error("Invalid verifier output");
          error.code = "REPLAY_INVALID";
          reject(error);
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify(input));
    });
  } finally {
    activeReplays--;
  }
}
