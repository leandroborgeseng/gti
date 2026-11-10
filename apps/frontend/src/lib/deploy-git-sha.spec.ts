import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readDeployGitShaEnv, resolveDeployGitSha, UNKNOWN_DEPLOY_GIT_SHA } from "./deploy-git-sha";
import { readBuildRecordedGitSha } from "./read-build-git-sha";

const FULL = "a55af025b83c1f26cd61d380b519009d877f3df3";
const RAILWAY = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const GIT = "cccccccccccccccccccccccccccccccccccccccc";
const COMMIT = "dddddddddddddddddddddddddddddddddddddddd";
const BUILD = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

test("readDeployGitShaEnv ignora NEXT_PUBLIC_GTI_BUILD e o resto do ambiente", () => {
  const env = readDeployGitShaEnv({
    SOURCE_COMMIT: FULL,
    RAILWAY_GIT_COMMIT_SHA: RAILWAY,
    GIT_SHA: GIT,
    COMMIT_SHA: COMMIT,
    GTI_BUILD_GIT_SHA: BUILD,
    NEXT_PUBLIC_GTI_BUILD: "a55af025",
    DATABASE_URL: "postgres://nao-usar",
  });
  assert.deepEqual(env, {
    SOURCE_COMMIT: FULL,
    RAILWAY_GIT_COMMIT_SHA: RAILWAY,
    GIT_SHA: GIT,
    COMMIT_SHA: COMMIT,
    GTI_BUILD_GIT_SHA: BUILD,
  });
});

test("SOURCE_COMMIT prevalece sobre Railway, GIT_SHA, COMMIT_SHA e o build", () => {
  const resolved = resolveDeployGitSha({
    env: {
      SOURCE_COMMIT: `  ${FULL}  `,
      RAILWAY_GIT_COMMIT_SHA: RAILWAY,
      GIT_SHA: GIT,
      COMMIT_SHA: COMMIT,
      GTI_BUILD_GIT_SHA: BUILD,
    },
    buildSha: "ffffffffffffffffffffffffffffffffffffffff",
  });
  assert.equal(resolved.gitSha, FULL);
  assert.equal(resolved.gitShaSource, "SOURCE_COMMIT");
});

test("SOURCE_COMMIT vazio ou unknown cai para RAILWAY_GIT_COMMIT_SHA", () => {
  for (const sourceCommit of ["", "   ", "unknown", "UNKNOWN", "Unknown"]) {
    const resolved = resolveDeployGitSha({
      env: {
        SOURCE_COMMIT: sourceCommit,
        RAILWAY_GIT_COMMIT_SHA: RAILWAY,
        GIT_SHA: GIT,
        COMMIT_SHA: COMMIT,
      },
      buildSha: BUILD,
    });
    assert.equal(resolved.gitSha, RAILWAY, `SOURCE_COMMIT=${JSON.stringify(sourceCommit)}`);
    assert.equal(resolved.gitShaSource, "RAILWAY_GIT_COMMIT_SHA");
  }
});

test("RAILWAY_GIT_COMMIT_SHA prevalece sobre GIT_SHA, COMMIT_SHA e o build", () => {
  const resolved = resolveDeployGitSha({
    env: {
      RAILWAY_GIT_COMMIT_SHA: ` ${RAILWAY} `,
      GIT_SHA: GIT,
      COMMIT_SHA: COMMIT,
      GTI_BUILD_GIT_SHA: BUILD,
    },
    buildSha: FULL,
  });
  assert.equal(resolved.gitSha, RAILWAY);
  assert.equal(resolved.gitShaSource, "RAILWAY_GIT_COMMIT_SHA");
});

test("GIT_SHA prevalece sobre COMMIT_SHA e o SHA de build", () => {
  const resolved = resolveDeployGitSha({
    env: {
      GIT_SHA: ` ${GIT} `,
      COMMIT_SHA: COMMIT,
      GTI_BUILD_GIT_SHA: BUILD,
    },
    buildSha: FULL,
  });
  assert.equal(resolved.gitSha, GIT);
  assert.equal(resolved.gitShaSource, "GIT_SHA");
});

test("COMMIT_SHA prevalece sobre o SHA gravado no build", () => {
  const resolved = resolveDeployGitSha({
    env: { COMMIT_SHA: COMMIT, GTI_BUILD_GIT_SHA: BUILD },
    buildSha: FULL,
  });
  assert.equal(resolved.gitSha, COMMIT);
  assert.equal(resolved.gitShaSource, "COMMIT_SHA");
});

test("GTI_BUILD_GIT_SHA é a origem build e prevalece sobre o arquivo", () => {
  const resolved = resolveDeployGitSha({
    env: { GTI_BUILD_GIT_SHA: ` ${BUILD} ` },
    buildSha: FULL,
  });
  assert.equal(resolved.gitSha, BUILD);
  assert.equal(resolved.gitShaSource, "build");
});

test("arquivo de build é usado quando não há env utilizável", () => {
  const resolved = resolveDeployGitSha({
    env: { SOURCE_COMMIT: "unknown", GIT_SHA: "  " },
    buildSha: `\n${FULL}\n`,
  });
  assert.equal(resolved.gitSha, FULL);
  assert.equal(resolved.gitShaSource, "build");
});

test("sem nenhuma fonte responde unknown", () => {
  const cases = [
    {},
    { env: {}, buildSha: null },
    { env: {}, buildSha: "   " },
    {
      env: { SOURCE_COMMIT: "unknown", RAILWAY_GIT_COMMIT_SHA: "", GIT_SHA: " ", COMMIT_SHA: "Unknown" },
      buildSha: "unknown",
    },
    { env: { GTI_BUILD_GIT_SHA: "  unknown  " }, buildSha: "" },
  ];
  for (const input of cases) {
    const resolved = resolveDeployGitSha(input);
    assert.equal(resolved.gitSha, UNKNOWN_DEPLOY_GIT_SHA);
    assert.equal(resolved.gitShaSource, "unknown");
  }
});

test("readBuildRecordedGitSha ignora caminho vazio ou ilegível e lê o seguinte", () => {
  const value = readBuildRecordedGitSha({
    paths: ["/tmp/gti-deploy-sha-ausente", "/tmp/gti-deploy-sha-ok"],
    readFile: (filePath) => {
      if (filePath.endsWith("ok")) return `  ${FULL}\n`;
      if (filePath.endsWith("ausente")) return "unknown\n";
      throw new Error("ENOENT");
    },
  });
  assert.equal(value, FULL);
});

test("readBuildRecordedGitSha devolve null se nada for utilizável", () => {
  assert.equal(
    readBuildRecordedGitSha({
      paths: ["/a", "/a", "/b"],
      readFile: () => {
        throw new Error("ENOENT");
      },
    }),
    null
  );
  assert.equal(
    readBuildRecordedGitSha({
      paths: ["/so-placeholder"],
      readFile: () => "  unknown  ",
    }),
    null
  );
});

test("readBuildRecordedGitSha lê um arquivo real", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gti-sha-"));
  const file = path.join(dir, ".deploy-git-sha");
  fs.writeFileSync(file, `${FULL}\n`, "utf8");
  try {
    assert.equal(readBuildRecordedGitSha({ paths: [file] }), FULL);
    fs.writeFileSync(file, "\n", "utf8");
    assert.equal(readBuildRecordedGitSha({ paths: [file] }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
