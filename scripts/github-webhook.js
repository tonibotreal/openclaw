#!/usr/bin/env node
/**
 * Combined GitHub Webhook Receiver for OpenClaw & ToniBot
 * 
 * Handles auto-deployment for both repositories.
 * Routes based on URL path:
 *   /openclaw → OpenClaw deployment
 *   /tonibot  → ToniBot deployment
 */

const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  PORT: process.env.WEBHOOK_PORT || 18888,
  LOG_FILE: '/home/openclaw/clawd/logs/webhook-deploy.log',
  EXECUTED_SCRIPTS_FILE: '/home/openclaw/clawd/.executed-scripts.json',
  REPOS: {
    openclaw: {
      secret: process.env.OPENCLAW_WEBHOOK_SECRET || '369d32e751a86227fa363d8d8847867306cdfcc8cf6f0e02e4eb30168100758b',
      dir: '/home/openclaw/clawd/openclaw-dev',
      branch: 'tonibot-custom',
      deployScriptsDir: 'scripts/deploy',  // One-shot scripts directory
    },
    tonibot: {
      secret: process.env.TONIBOT_WEBHOOK_SECRET || '796cfffe95edb47b9022ccea292f92f96b0afc7efd77a3f6fad594ba436f58a7',
      dir: '/home/openclaw/clawd/tonibot',
      branch: 'master',
      deployScriptsDir: 'scripts/deploy',
    },
  },
};

// Ensure log directory exists
const logDir = path.dirname(CONFIG.LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function log(level, message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level}] ${message}\n`;
  console.log(entry.trim());
  fs.appendFileSync(CONFIG.LOG_FILE, entry);
}

// ============ One-Shot Script Execution System ============

function loadExecutedScripts() {
  try {
    if (fs.existsSync(CONFIG.EXECUTED_SCRIPTS_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.EXECUTED_SCRIPTS_FILE, 'utf8'));
    }
  } catch (e) {
    log('WARN', `Failed to load executed scripts file: ${e.message}`);
  }
  return { executed: {} };
}

function saveExecutedScripts(data) {
  fs.writeFileSync(CONFIG.EXECUTED_SCRIPTS_FILE, JSON.stringify(data, null, 2));
}

function markScriptExecuted(repoName, scriptPath, success, output) {
  const data = loadExecutedScripts();
  if (!data.executed[repoName]) {
    data.executed[repoName] = {};
  }
  data.executed[repoName][scriptPath] = {
    executedAt: new Date().toISOString(),
    success,
    output: output?.substring(0, 500) || '',  // Truncate output
  };
  saveExecutedScripts(data);
}

function isScriptExecuted(repoName, scriptPath) {
  const data = loadExecutedScripts();
  return data.executed[repoName]?.[scriptPath]?.success === true;
}

/**
 * Execute pending one-shot deploy scripts
 * Scripts in scripts/deploy/ are run once after merge, then marked as executed.
 * Convention:
 *   - scripts/deploy/*.sh - One-shot scripts (run once, tracked)
 *   - Scripts must be executable and exit 0 on success
 */
function runDeployScripts(repoName) {
  const repo = CONFIG.REPOS[repoName];
  const deployDir = path.join(repo.dir, repo.deployScriptsDir);
  
  if (!fs.existsSync(deployDir)) {
    log('INFO', `[${repoName}] No deploy scripts directory found at ${repo.deployScriptsDir}`);
    return { ran: 0, success: 0, failed: 0 };
  }
  
  const scripts = fs.readdirSync(deployDir)
    .filter(f => f.endsWith('.sh'))
    .sort();  // Run in alphabetical order
  
  if (scripts.length === 0) {
    log('INFO', `[${repoName}] No deploy scripts found`);
    return { ran: 0, success: 0, failed: 0 };
  }
  
  const results = { ran: 0, success: 0, failed: 0, details: [] };
  
  for (const script of scripts) {
    const scriptPath = path.join(repo.deployScriptsDir, script);
    const fullPath = path.join(repo.dir, scriptPath);
    
    // Skip if already executed
    if (isScriptExecuted(repoName, scriptPath)) {
      log('INFO', `[${repoName}] Skipping already-executed script: ${script}`);
      continue;
    }
    
    log('INFO', `[${repoName}] Running deploy script: ${script}`);
    results.ran++;
    
    try {
      // Make executable and run with proper PATH
      execSync(`chmod +x "${fullPath}"`, { encoding: 'utf8' });
      const output = execSync(`export PATH="/usr/sbin:/usr/bin:/sbin:/bin:$PATH" && bash "${fullPath}"`, {
        encoding: 'utf8',
        timeout: 120000,  // 2 minute timeout per script
        env: { ...process.env, PATH: '/usr/sbin:/usr/bin:/sbin:/bin:' + process.env.PATH },
      });
      
      log('INFO', `[${repoName}] Script ${script} completed successfully`);
      markScriptExecuted(repoName, scriptPath, true, output);
      results.success++;
      results.details.push({ script, success: true });
    } catch (err) {
      log('ERROR', `[${repoName}] Script ${script} failed: ${err.message}`);
      markScriptExecuted(repoName, scriptPath, false, err.message);
      results.failed++;
      results.details.push({ script, success: false, error: err.message });
    }
  }
  
  return results;
}

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  const digestBuf = Buffer.from(digest);
  const signatureBuf = Buffer.from(signature);
  // timingSafeEqual requires same length buffers
  if (digestBuf.length !== signatureBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(digestBuf, signatureBuf);
}

function deployOpenClaw() {
  try {
    log('INFO', '[OpenClaw] Starting deployment...');
    
    const repo = CONFIG.REPOS.openclaw;
    
    // Configure git safe directory (prevents dubious ownership errors)
    execSync(`git config --global --add safe.directory ${repo.dir} 2>/dev/null || true`, { encoding: 'utf8' });
    
    // First, just pull the changes
    const pullCmds = [
      `cd ${repo.dir}`,
      'git fetch origin',
      `git checkout ${repo.branch}`,
      `git pull origin ${repo.branch}`,
    ];
    
    execSync(pullCmds.join(' && '), { encoding: 'utf8' });
    log('INFO', '[OpenClaw] Code pulled successfully');
    
    // Check if any TypeScript files changed (require build)
    const changedFiles = execSync(`cd ${repo.dir} && git diff --name-only HEAD~1 HEAD || echo ""`, { encoding: 'utf8' });
    const needsBuild = changedFiles.split('\n').some(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    
    if (!needsBuild) {
      log('INFO', '[OpenClaw] No TypeScript changes detected - skipping build');
      
      // Run any pending deploy scripts
      const scriptResults = runDeployScripts('openclaw');
      if (scriptResults.ran > 0) {
        const msg = `Scripts: ${scriptResults.success}/${scriptResults.ran} succeeded`;
        log('INFO', `[OpenClaw] ${msg}`);
        if (scriptResults.failed > 0) {
          notify(`⚠️ OpenClaw updated - ${msg} (${scriptResults.failed} failed)`, getDeployContextString());
        } else {
          notify(`✅ OpenClaw updated + ${scriptResults.ran} deploy script(s) executed`, getDeployContextString());
        }
      } else {
        notify('✅ OpenClaw updated (scripts/configs only)', getDeployContextString());
      }
      return true;
    }
    
    // Full build required for TypeScript changes
    log('INFO', '[OpenClaw] TypeScript changes detected - running build...');
    const buildCmds = [
      `cd ${repo.dir}`,
      'cp -r /usr/lib/node_modules/openclaw/dist . 2>/dev/null || true',
      'npm list -g esbuild >/dev/null 2>&1 || npm install -g esbuild',
      'pnpm canvas:a2ui:bundle || true',
      'node --import tsx scripts/copy-hook-metadata.ts || true',
      'node --import tsx scripts/write-build-info.ts || true',
      'cp -r dist/* /usr/lib/node_modules/openclaw/dist/',
      'pkill -SIGUSR1 -f "openclaw-gateway" || true',
    ];
    
    execSync(buildCmds.join(' && '), { encoding: 'utf8' });
    log('INFO', '[OpenClaw] Build completed');
    
    // Run any pending deploy scripts after build
    const scriptResults = runDeployScripts('openclaw');
    if (scriptResults.ran > 0) {
      const msg = `+ ${scriptResults.success}/${scriptResults.ran} scripts`;
      log('INFO', `[OpenClaw] Deploy scripts: ${msg}`);
      if (scriptResults.failed > 0) {
        notify(`⚠️ OpenClaw deployed ${msg} (${scriptResults.failed} failed)`, getDeployContextString());
      } else {
        notify(`✅ OpenClaw deployed ${msg}`, getDeployContextString());
      }
    } else {
      notify('✅ OpenClaw deployment successful', getDeployContextString());
    }
    return true;
  } catch (err) {
    log('ERROR', `[OpenClaw] Deployment failed: ${err.message}`);
    const errorDetails = `${getDeployContextString()}\n\n**Error:** ${err.message.substring(0, 500)}`;
    notify(`❌ OpenClaw deployment failed`, errorDetails);
    return false;
  }
}

function deployToniBot() {
  try {
    log('INFO', '[ToniBot] Starting deployment...');
    
    const repo = CONFIG.REPOS.tonibot;
    
    // Configure git safe directory (prevents dubious ownership errors)
    execSync(`git config --global --add safe.directory ${repo.dir} 2>/dev/null || true`, { encoding: 'utf8' });
    
    const cmds = [
      `cd ${repo.dir}`,
      'git fetch origin',
      `git checkout ${repo.branch}`,
      `git pull origin ${repo.branch}`,
      'chmod +x scripts/*.sh scripts/*.py 2>/dev/null || true',
      'cp -r scripts/* /home/openclaw/clawd/scripts/ 2>/dev/null || true',
      'cp -r docs/* /home/openclaw/clawd/docs/ 2>/dev/null || true',
    ];
    
    const result = execSync(cmds.join(' && '), { encoding: 'utf8' });
    log('INFO', '[ToniBot] Files deployed');
    
    // Run any pending deploy scripts
    const scriptResults = runDeployScripts('tonibot');
    if (scriptResults.ran > 0) {
      const msg = `+ ${scriptResults.success}/${scriptResults.ran} scripts`;
      log('INFO', `[ToniBot] Deploy scripts: ${msg}`);
      if (scriptResults.failed > 0) {
        notify(`⚠️ ToniBot deployed ${msg} (${scriptResults.failed} failed)`, getDeployContextString());
      } else {
        notify(`✅ ToniBot deployed ${msg}`, getDeployContextString());
      }
    } else {
      notify('✅ ToniBot config deployment successful', getDeployContextString());
    }
    return true;
  } catch (err) {
    log('ERROR', `[ToniBot] Deployment failed: ${err.message}`);
    const errorDetails = `${getDeployContextString()}\n\n**Error:** ${err.message.substring(0, 500)}`;
    notify(`❌ ToniBot deployment failed`, errorDetails);
    return false;
  }
}

function notify(message, details = null) {
  log('INFO', `Notification: ${message}`);
  
  // Build full message with details if provided
  let fullMessage = `[Webhook] ${message}`;
  if (details) {
    fullMessage += `\n\n${details}`;
  }
  
  // Queue notification for pickup by cron job (runs every 2 minutes)
  const NOTIFY_FILE = '/home/openclaw/clawd/notifications/pending.jsonl';
  try {
    const dir = path.dirname(NOTIFY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const notification = {
      timestamp: Date.now(),
      target: '+16198209498',
      message: fullMessage,
    };
    
    fs.appendFileSync(NOTIFY_FILE, JSON.stringify(notification) + '\n');
    log('INFO', 'Notification queued for delivery');
  } catch (e) {
    log('WARN', `Failed to queue notification: ${e.message}`);
  }
}

// Store current deployment context for notifications
let deployContext = {};

function handleWebhook(repoName, payload, event) {
  const repo = CONFIG.REPOS[repoName];
  
  if (event === 'push') {
    const branch = payload.ref?.replace('refs/heads/', '');
    if (branch === repo.branch) {
      log('INFO', `[${repoName}] Push detected to ${branch}`);
      const commit = payload.head_commit;
      deployContext = {
        repo: repoName,
        type: 'push',
        branch,
        commit: commit?.id?.substring(0, 7) || 'unknown',
        message: commit?.message?.split('\n')[0] || 'No message',
        author: commit?.author?.name || payload.pusher?.name || 'unknown',
      };
      return repoName === 'openclaw' ? deployOpenClaw() : deployToniBot();
    }
  }
  else if (event === 'pull_request') {
    const action = payload.action;
    const merged = payload.pull_request?.merged;
    const baseBranch = payload.pull_request?.base?.ref;
    
    if (action === 'closed' && merged && baseBranch === repo.branch) {
      log('INFO', `[${repoName}] PR merged into ${baseBranch}`);
      const pr = payload.pull_request;
      deployContext = {
        repo: repoName,
        type: 'pr',
        prNumber: pr?.number,
        prTitle: pr?.title,
        branch: pr?.head?.ref,
        author: pr?.user?.login || 'unknown',
      };
      return repoName === 'openclaw' ? deployOpenClaw() : deployToniBot();
    }
  }
  
  return false;
}

function getDeployContextString() {
  const ctx = deployContext;
  if (ctx.type === 'pr') {
    return `PR #${ctx.prNumber}: ${ctx.prTitle}\nBranch: ${ctx.branch}\nBy: ${ctx.author}`;
  } else if (ctx.type === 'push') {
    return `Commit: ${ctx.commit}\nMessage: ${ctx.message}\nBy: ${ctx.author}`;
  }
  return '';
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  
  // Determine which repo based on path
  let repoName;
  if (path === '/openclaw' || path === '/openclaw/') {
    repoName = 'openclaw';
  } else if (path === '/tonibot' || path === '/tonibot/') {
    repoName = 'tonibot';
  } else {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  
  const repo = CONFIG.REPOS[repoName];
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  
  if (!signature) {
    log('WARN', `[${repoName}] Request missing signature`);
    res.writeHead(401);
    res.end('Unauthorized');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      if (!verifySignature(body, signature, repo.secret)) {
        log('WARN', `[${repoName}] Invalid signature`);
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }

      log('INFO', `[${repoName}] Received ${event} event`);
      
      const payload = JSON.parse(body);
      const triggered = handleWebhook(repoName, payload, event);
      
      if (triggered) {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'deploying', repo: repoName }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ignored', repo: repoName, event }));
      }
    } catch (err) {
      log('ERROR', `[${repoName}] Webhook error: ${err.message}`);
      res.writeHead(500);
      res.end('Internal error');
    }
  });
});

server.listen(CONFIG.PORT, () => {
  log('INFO', `Combined webhook receiver listening on port ${CONFIG.PORT}`);
  log('INFO', 'Endpoints:');
  log('INFO', '  - /openclaw  → OpenClaw deployment');
  log('INFO', '  - /tonibot   → ToniBot deployment');
});

process.on('SIGTERM', () => {
  log('INFO', 'Shutting down...');
  server.close(() => process.exit(0));
});
