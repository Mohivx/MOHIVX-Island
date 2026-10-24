const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { AgentHookConfig } = require('../electron/services/agentHookConfig.cjs');
const { questionLauncher } = require('../electron/services/managedAgentConfig.cjs');

function safeCopyFile(src, dst) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source helper file not found: ${path.basename(src)}`);
  }
  const srcBytes = fs.readFileSync(src);
  if (fs.existsSync(dst)) {
    try {
      const dstBytes = fs.readFileSync(dst);
      if (srcBytes.equals(dstBytes)) {
        return false;
      }
    } catch {
      // Re-copy if reading destination fails
    }
  }
  const dir = path.dirname(dst);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(dst)}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tmp, srcBytes);
    fs.renameSync(tmp, dst);
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
    throw err;
  }
}

function detectSupportedAgents(homeDir, allowlist) {
  const detections = [
    {
      agent: 'codex',
      check: () => fs.existsSync(path.join(homeDir, '.codex'))
    },
    {
      agent: 'antigravity',
      check: () => fs.existsSync(path.join(homeDir, '.gemini', 'config'))
    },
    {
      agent: 'gemini',
      check: () => fs.existsSync(path.join(homeDir, '.gemini', 'settings.json')) ||
                   fs.existsSync(path.join(homeDir, '.gemini', 'GEMINI.md'))
    },
    {
      agent: 'claude',
      check: () => fs.existsSync(path.join(homeDir, '.claude'))
    }
  ];

  const allowedSet = Array.isArray(allowlist) ? new Set(allowlist) : null;
  const detected = [];

  for (const { agent, check } of detections) {
    if (allowedSet && !allowedSet.has(agent)) {
      continue;
    }
    try {
      if (check()) {
        detected.push(agent);
      }
    } catch {
      // Ignore filesystem access check failures
    }
  }

  return detected;
}

function setupAgentRouting(options = {}) {
  const home = options.home || os.homedir();
  const sourceRoot = options.sourceRoot || path.resolve(__dirname, '..');
  const binDir = options.binDir || path.join(home, '.mohivx-island', 'bin');
  const runtimeExe = options.runtimeExe || process.execPath;
  const targetAgents = options.agents;
  if (!fs.existsSync(runtimeExe)) throw new Error('Question runtime is unavailable.');
  if (targetAgents !== undefined && (!Array.isArray(targetAgents) || targetAgents.some(agent => !['codex','gemini','antigravity','claude'].includes(agent)))) throw new Error('Unsupported question agent.');
  const launcherContent = questionLauncher(runtimeExe, path.join(binDir,'ask-island.cjs'));

  fs.mkdirSync(binDir, { recursive: true });

  const hookSrc = path.join(sourceRoot, 'bin', 'mohivx-hook.exe');
  const askSrc = path.join(sourceRoot, 'scripts', 'ask-island.cjs');
  const mcpSrc = path.join(sourceRoot, 'scripts', 'island-mcp.cjs');

  const hookDst = path.join(binDir, 'mohivx-hook.exe');
  const askDst = path.join(binDir, 'ask-island.cjs');
  const mcpDst = path.join(binDir, 'island-mcp.cjs');

  safeCopyFile(hookSrc, hookDst);
  safeCopyFile(askSrc, askDst);
  safeCopyFile(mcpSrc, mcpDst);

  const launcherPath = path.join(binDir, 'mohivx-ask.cmd');
  const launcherBytes = Buffer.from(launcherContent, 'utf8');

  let writeLauncher = true;
  if (fs.existsSync(launcherPath)) {
    try {
      const existing = fs.readFileSync(launcherPath);
      if (existing.equals(launcherBytes)) {
        writeLauncher = false;
      }
    } catch {}
  }

  if (writeLauncher) {
    const tmpLauncher = path.join(binDir, `.mohivx-ask.${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(tmpLauncher, launcherBytes);
      fs.renameSync(tmpLauncher, launcherPath);
    } catch (err) {
      try {
        if (fs.existsSync(tmpLauncher)) fs.unlinkSync(tmpLauncher);
      } catch {}
      throw err;
    }
  }

  const detected = detectSupportedAgents(home, targetAgents);

  if (detected.length === 0) {
    return {
      success: true,
      connected: [],
      failed: [],
      backups: [],
      restartRequired: true
    };
  }

  const hookConfig = new AgentHookConfig(home, hookDst, {
    binDir,
    runtimeExe,
    askScript: askDst,
    mcpScript: mcpDst
  });

  const connected = [];
  const failed = [];
  const backups = [];

  for (const agent of detected) {
    try {
      const preview = hookConfig.preview(agent, true);
      const result = hookConfig.apply(preview.id);
      if (result && Array.isArray(result.backups)) {
        for (const b of result.backups) {
          if (b && !backups.includes(b)) {
            backups.push(b);
          }
        }
      }
      connected.push(agent);
    } catch (err) {
      failed.push({
        agent,
        error: (err && err.message) ? err.message : 'Configuration failed.'
      });
    }
  }

  return {
    success: failed.length === 0,
    connected,
    failed,
    backups,
    restartRequired: true
  };
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  let install = false;
  let home;
  let runtime;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--install') {
      install = true;
    } else if (arg === '--home') {
      const val = args[++i];
      if (!val || val.startsWith('--')) {
        throw new Error('Invalid command-line arguments.');
      }
      home = path.resolve(val);
    } else if (arg === '--runtime') {
      const val = args[++i];
      if (!val || val.startsWith('--')) {
        throw new Error('Invalid command-line arguments.');
      }
      runtime = path.resolve(val);
    } else {
      throw new Error('Invalid command-line arguments.');
    }
  }

  return { install, home, runtime };
}

function cli(argv = process.argv) {
  try {
    const { install, home, runtime } = parseCliArgs(argv);
    if (!install) {
      const summary = {
        success: false,
        connected: [],
        failed: [{ agent: 'cli', error: 'Missing --install flag.' }],
        backups: [],
        restartRequired: false
      };
      console.log(JSON.stringify(summary));
      process.exitCode = 1;
      return summary;
    }

    const options = {};
    if (home) options.home = home;
    if (runtime) options.runtimeExe = runtime;

    const result = setupAgentRouting(options);
    console.log(JSON.stringify(result));
    if (!result.success || (result.failed && result.failed.length > 0)) {
      process.exitCode = 1;
    }
    return result;
  } catch {
    const summary = {
      success: false,
      connected: [],
      failed: [{ agent: 'cli', error: 'Invalid command-line arguments.' }],
      backups: [],
      restartRequired: false
    };
    console.log(JSON.stringify(summary));
    process.exitCode = 1;
    return summary;
  }
}

module.exports = {
  setupAgentRouting,
  cli
};

if (require.main === module) {
  cli(process.argv);
}
