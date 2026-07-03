import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEnvironment } from "../src/env/detect.js";

test("snapshot is populated and correctly typed on this machine", async () => {
  const snap = await detectEnvironment();
  assert.ok(["darwin", "linux"].includes(snap.platform), "unix platform");
  assert.ok(snap.osVersion.length > 0);
  assert.ok(snap.arch.length > 0);
  assert.ok(snap.pathEntries.length > 0, "PATH has entries");
  assert.ok(snap.shell.rcFile.startsWith("/"), "rc file is absolute");
  assert.ok(snap.homeDir.startsWith("/"));
  assert.ok(!Number.isNaN(Date.parse(snap.detectedAt)));
  for (const pm of snap.packageManagers) {
    assert.ok(pm.path.startsWith("/"), `${pm.name} has absolute path`);
  }
});
