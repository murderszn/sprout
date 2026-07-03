import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEnvironment } from "../src/env/detect.js";
import path from "node:path";

test("snapshot is populated and correctly typed on this machine", async () => {
  const snap = await detectEnvironment();
  assert.ok(["darwin", "linux", "win32"].includes(snap.platform), "supported platform");
  assert.ok(snap.osVersion.length > 0);
  assert.ok(snap.arch.length > 0);
  assert.ok(snap.pathEntries.length > 0, "PATH has entries");
  assert.ok(path.isAbsolute(snap.shell.rcFile), "rc file is absolute");
  assert.ok(path.isAbsolute(snap.homeDir), "home dir is absolute");
  assert.ok(!Number.isNaN(Date.parse(snap.detectedAt)));
  for (const pm of snap.packageManagers) {
    assert.ok(path.isAbsolute(pm.path), `${pm.name} has absolute path`);
  }
});
