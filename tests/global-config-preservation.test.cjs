const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// Import module under test
const agentHookConfigPath = path.resolve(__dirname, '..', 'electron', 'services', 'agentHookConfig.cjs');
const {
  AgentHookConfig,
  mergeCodexToml,
  stripOwnedCodexToml,
  validateToml,
  mergeInstructionsMarkdown,
  TOML_START,
  TOML_END,
  MD_START,
  MD_END
} = require(agentHookConfigPath);

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mohivx-test-config-'));
}

test('Exact roundtrip and idempotence with CRLF, blank lines, and no-final-newline', () => {
  const cases = [
    { name: 'LF with final newline', text: 'model = "gpt-4"\n\n[other]\nkey = "val"\n' },
    { name: 'LF without final newline', text: 'model = "gpt-4"\n\n[other]\nkey = "val"' },
    { name: 'CRLF with final newline', text: 'model = "gpt-4"\r\n\r\n[other]\r\nkey = "val"\r\n' },
    { name: 'CRLF without final newline', text: 'model = "gpt-4"\r\n\r\n[other]\r\nkey = "val"' },
    { name: 'Multiple trailing newlines CRLF', text: 'model = "gpt-4"\r\n\r\n' },
    { name: 'Single line no newline', text: 'model = "gpt-4"' },
    { name: 'Empty string', text: '' }
  ];

  for (const c of cases) {
    // 1. TOML test
    const tomlMerged = mergeCodexToml(c.text, 'node.exe', 'island-mcp.cjs', true);
    assert.ok(tomlMerged.includes(TOML_START), `${c.name}: should contain start marker`);
    assert.ok(tomlMerged.includes(TOML_END), `${c.name}: should contain end marker`);

    // Idempotent install
    const tomlReinstalled = mergeCodexToml(tomlMerged, 'node.exe', 'island-mcp.cjs', true);
    assert.equal(tomlReinstalled, tomlMerged, `${c.name}: TOML install should be idempotent`);

    // Uninstall restores exact bytes
    const tomlUninstalled = mergeCodexToml(tomlMerged, 'node.exe', 'island-mcp.cjs', false);
    assert.equal(tomlUninstalled, c.text, `${c.name}: TOML uninstall should restore exact original bytes`);

    // 2. Markdown test
    const mdMerged = mergeInstructionsMarkdown(c.text, 'codex', 'node.exe', 'ask-island.cjs', true);
    assert.ok(mdMerged.includes(MD_START), `${c.name}: MD should contain start marker`);
    assert.ok(mdMerged.includes(MD_END), `${c.name}: MD should contain end marker`);

    // Idempotent install
    const mdReinstalled = mergeInstructionsMarkdown(mdMerged, 'codex', 'node.exe', 'ask-island.cjs', true);
    assert.equal(mdReinstalled, mdMerged, `${c.name}: MD install should be idempotent`);

    // Uninstall restores exact bytes
    const mdUninstalled = mergeInstructionsMarkdown(mdMerged, 'codex', 'node.exe', 'ask-island.cjs', false);
    assert.equal(mdUninstalled, c.text, `${c.name}: MD uninstall should restore exact original bytes`);
  }
});

test('BOM preservation in readText', () => {
  const tmpDir = createTempDir();
  try {
    const file = path.join(tmpDir, 'test.md');
    const content = '\uFEFF# Title\r\nSome instructions';
    fs.writeFileSync(file, Buffer.from(content, 'utf8'));

    const fakeExe = path.join(tmpDir, 'mohivx-hook.exe');
    fs.writeFileSync(fakeExe, '');
    const config = new AgentHookConfig(tmpDir, fakeExe);

    const { bytes, text } = config.readText(file);
    assert.ok(text.startsWith('\uFEFF'), 'readText text should preserve BOM character');
    assert.ok(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, 'readText bytes should preserve BOM');

    // Also verify mergeInstructionsMarkdown roundtrip with BOM
    const merged = mergeInstructionsMarkdown(text, 'codex', 'node.exe', 'ask.cjs', true);
    assert.ok(merged.startsWith('\uFEFF'), 'merged markdown should retain BOM');
    const restored = mergeInstructionsMarkdown(merged, 'codex', 'node.exe', 'ask.cjs', false);
    assert.equal(restored, text, 'restored markdown should preserve exact BOM and contents');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Valid multiline arrays and quoted table names are accepted by validateToml', () => {
  const validTomls = [
    `
[servers."quoted.name"]
ip = "127.0.0.1"
ports = [
  8001,
  8002,
  8003
]
`,
    `
array = [
  "one",
  "two",
  "three"
]
inline_table = { a = 1, b = 2 }
`,
    `
['single.quoted'.table]
key = "value"
`,
    `
model = "gpt-5"
description = """
Line 1
Line 2
"""
array = [
  { name = "sub" },
  { name = "sub2" }
]
`
  ];

  for (const t of validTomls) {
    assert.doesNotThrow(() => validateToml(t), `Should not throw for valid TOML:\n${t}`);
    assert.doesNotThrow(() => mergeCodexToml(t, 'node', 'mcp.cjs', true));
  }
});

test('Conflicting unowned mohivx_island table is rejected', () => {
  const conflictingToml = `
[mcp_servers.mohivx_island]
command = "alien_tool"
args = ["--malicious"]
`;

  assert.throws(
    () => mergeCodexToml(conflictingToml, 'node', 'mcp.cjs', true),
    /already belongs to another tool/
  );

  const conflictingQuoted = `
[mcp_servers."mohivx_island"]
command = "alien_tool"
`;

  assert.throws(
    () => mergeCodexToml(conflictingQuoted, 'node', 'mcp.cjs', true),
    /already belongs to another tool/
  );
});

test('Apply skips unchanged targets', () => {
  const tmpDir = createTempDir();
  try {
    const fakeExe = path.join(tmpDir, 'mohivx-hook.exe');
    fs.writeFileSync(fakeExe, 'binary');

    const config = new AgentHookConfig(tmpDir, fakeExe);

    // Initial install for antigravity
    const preview1 = config.preview('antigravity', true);
    assert.ok(preview1.changed);
    const apply1 = config.apply(preview1.id);
    assert.ok(apply1.success);

    // Re-preview install: should be unchanged
    const preview2 = config.preview('antigravity', true);
    assert.equal(preview2.changed, false, 'Preview should report changed=false');
    assert.equal(preview2.changedPaths.length, 0);

    // Ensure mtime doesn't change when apply runs for unchanged preview
    const hookFile = config.file('antigravity');
    const mtimeBefore = fs.statSync(hookFile).mtimeMs;

    const apply2 = config.apply(preview2.id);
    assert.ok(apply2.success);
    const mtimeAfter = fs.statSync(hookFile).mtimeMs;
    assert.equal(mtimeAfter, mtimeBefore, 'Unchanged file should not be rewritten or modified');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Mid-transaction next-target race triggers rollback and revalidation', () => {
  const tmpDir = createTempDir();
  try {
    const fakeExe = path.join(tmpDir, 'mohivx-hook.exe');
    fs.writeFileSync(fakeExe, 'binary');

    // Set up codex which has hooks, toml, and instructions
    const config = new AgentHookConfig(tmpDir, fakeExe);
    const preview = config.preview('codex', true);

    assert.ok(config.plans.get(preview.id).targets.length >= 2, 'Codex should have multiple targets');
    const firstTarget = config.plans.get(preview.id).targets[0];
    const secondTarget = config.plans.get(preview.id).targets[1];

    // Simulate an external race modification right after target 0 is written
    let hooked = false;
    config.options.onAfterTargetWrite = (target, index) => {
      if (index === 0 && !hooked) {
        hooked = true;
        // Tamper with the second target before it gets written
        fs.mkdirSync(path.dirname(secondTarget.real), { recursive: true });
        fs.writeFileSync(secondTarget.real, 'concurrent external modification\r\n');
      }
    };

    assert.throws(
      () => config.apply(preview.id),
      /Settings changed\. Review the new changes first\./
    );

    // First target should have been rolled back because it was committed then aborted
    if (firstTarget.beforeBytes === null) {
      assert.equal(fs.existsSync(firstTarget.real), false, 'Target 0 should be deleted if it did not exist before');
    } else {
      const restored = fs.readFileSync(firstTarget.real);
      assert.deepEqual(restored, firstTarget.beforeBytes, 'Target 0 should be rolled back to beforeBytes');
    }
    assert.equal(fs.readFileSync(secondTarget.real,'utf8'),'concurrent external modification\r\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Concurrent external edit made after target write is preserved on rollback', () => {
  const tmpDir = createTempDir();
  try {
    const fakeExe = path.join(tmpDir, 'mohivx-hook.exe');
    fs.writeFileSync(fakeExe, 'binary');

    const config = new AgentHookConfig(tmpDir, fakeExe);
    const preview = config.preview('codex', true);

    assert.ok(config.plans.get(preview.id).targets.length >= 2);
    const firstTarget = config.plans.get(preview.id).targets[0];
    const secondTarget = config.plans.get(preview.id).targets[1];

    // During target 0 post-write, modify target 0 externally AND modify target 1 to cause failure
    config.options.onAfterTargetWrite = (target, index) => {
      if (index === 0) {
        // External edit on target 0
        fs.writeFileSync(firstTarget.real, 'external human edit while applying');
        // Cause failure on target 1
        fs.mkdirSync(path.dirname(secondTarget.real), { recursive: true });
        fs.writeFileSync(secondTarget.real, 'tamper target 1 to force rollback');
      }
    };

    assert.throws(() => config.apply(preview.id));

    // Target 0 has an external edit (afterHash doesn't match our written afterHash)
    // The rollback MUST preserve this external edit!
    const contentTarget0 = fs.readFileSync(firstTarget.real, 'utf8');
    assert.equal(contentTarget0, 'external human edit while applying', 'External edit must be preserved on rollback');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('a previously connected portable runtime is repaired after its extraction disappears',t=>{
 const dir=createTempDir();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const exe=path.join(dir,'mohivx-hook.exe'),oldRuntime=path.join(dir,'old-portable','MOHIVX Island.exe');fs.writeFileSync(exe,'fixture');
 const first=new AgentHookConfig(dir,exe,{runtimeExe:oldRuntime});
 first.apply(first.preview('codex',true).id);first.apply(first.preview('gemini',true).id);
 const newer=new AgentHookConfig(dir,exe,{runtimeExe:process.execPath});
 assert.deepEqual(newer.refreshMissingRuntimes(),{refreshed:['codex','gemini'],failed:[]});
 assert.ok(fs.readFileSync(path.join(dir,'.codex/config.toml'),'utf8').includes(JSON.stringify(process.execPath)));
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'.gemini/settings.json'))).mcpServers.mohivx_island.command,process.execPath);
 assert.deepEqual(newer.refreshMissingRuntimes(),{refreshed:[],failed:[]});
 assert.equal(fs.existsSync(path.join(dir,'.gemini/config/mcp_config.json')),false,'unconnected clients must stay untouched');
});
