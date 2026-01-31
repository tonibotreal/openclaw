# OpenClaw System Setup Guide

Complete guide for setting up OpenClaw with Toni assistant on a fresh Ubuntu system.

## Prerequisites

- Ubuntu 22.04+ (or similar Debian-based system)
- Root access
- GitHub account with forked repositories
- WhatsApp account for messaging

## 1. System User Setup

```bash
# Create dedicated user
sudo useradd -m -s /bin/bash openclaw
sudo usermod -aG sudo openclaw

# Set password (optional but recommended)
sudo passwd openclaw
```

## 2. Directory Structure

```bash
# Create workspace
sudo mkdir -p /home/openclaw/clawd
sudo chown -R openclaw:openclaw /home/openclaw

# Clone repositories
cd /home/openclaw/clawd
git clone https://github.com/tonibotreal/openclaw.git openclaw-dev
git clone https://github.com/tonibotreal/tonibot.git tonibot
```

## 3. Install Dependencies

```bash
# Install Node.js (v22+)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install OpenClaw globally
npm install -g openclaw

# Install other tools
sudo apt-get install -y git curl wget tmux htop ufw fail2ban
```

## 4. Sudoers Configuration

The openclaw user needs full sudo access to manage the system. Create `/etc/sudoers.d/openclaw`:

```bash
sudo visudo -f /etc/sudoers.d/openclaw
```

Add this line for full system access:
```
openclaw ALL=(root) NOPASSWD: ALL
```

Set permissions:
```bash
sudo chmod 440 /etc/sudoers.d/openclaw
```

**Note:** This gives the openclaw user full root privileges without password. In production environments, consider using granular permissions instead.

## 5. GitHub CLI Setup

```bash
# Install GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh -y

# Authenticate (run as openclaw user)
su - openclaw
gh auth login
# OR save token to file
echo "ghp_YOUR_TOKEN_HERE" > ~/.openclaw/github-token
chmod 600 ~/.openclaw/github-token
gh auth login --with-token < ~/.openclaw/github-token
```

## 6. Webhook Service Setup

Create `/etc/systemd/system/github-webhook.service`:

```ini
[Unit]
Description=GitHub Webhook Receiver (OpenClaw + ToniBot)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/openclaw/clawd
Environment="WEBHOOK_PORT=18888"
Environment="OPENCLAW_WEBHOOK_SECRET=your-webhook-secret-here"
Environment="TONIBOT_WEBHOOK_SECRET=your-webhook-secret-here"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /home/openclaw/clawd/scripts/github-webhook.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable github-webhook
sudo systemctl start github-webhook
```

## 7. OpenClaw Configuration

```bash
# Run initial setup
openclaw onboard

# Configure WhatsApp
openclaw gateway config --set channels.whatsapp.enabled=true
openclaw gateway config --set channels.whatsapp.dmPolicy=allowlist
openclaw gateway config --set channels.whatsapp.allowFrom=["+1234567890"]

# Configure model prefixing
openclaw gateway config --set messages.responsePrefix="[{model}]"

# Set workspace
openclaw gateway config --set agents.defaults.workspace=/home/openclaw/clawd
```

## 8. WhatsApp Pairing

```bash
# Start gateway
openclaw gateway start

# Generate QR code for WhatsApp pairing
openclaw whatsapp login

# Scan QR code with WhatsApp app
# Settings → Linked Devices → Link a Device
```

## 9. Security Hardening

### Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 18789/tcp  # OpenClaw gateway
sudo ufw allow 18888/tcp  # Webhook receiver
sudo ufw enable
```

### fail2ban
```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### SSH Key-only Auth
```bash
# Edit SSH config
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

## 10. Cron Jobs

```bash
# Add to openclaw user's crontab
crontab -e

# Health check every 10 minutes
*/10 * * * * /home/openclaw/clawd/scripts/webhook-health-check.sh

# Daily cleanup
0 3 * * * /home/openclaw/clawd/scripts/cleanup_temp_files.sh
```

## 11. Monitoring

### Check service status
```bash
sudo systemctl status openclaw-gateway
sudo systemctl status github-webhook
```

### View logs
```bash
# Gateway logs
sudo journalctl -u openclaw-gateway -f

# Webhook logs
tail -f /home/openclaw/clawd/logs/webhook-deploy.log

# Health check logs
tail -f /home/openclaw/clawd/logs/webhook-health.log
```

## 12. Backup

Important files to backup:
- `/home/openclaw/.openclaw/openclaw.json` - Main config
- `/home/openclaw/.openclaw/credentials/` - WhatsApp credentials
- `/home/openclaw/.openclaw/memory/` - Memory database
- `/home/openclaw/clawd/memory/` - Daily notes and tasks

## Troubleshooting

### Webhook not deploying
1. Check service: `sudo systemctl status github-webhook`
2. Check logs: `tail -f /home/openclaw/clawd/logs/webhook-deploy.log`
3. Verify path: Ensure script is at `/home/openclaw/clawd/scripts/github-webhook.js`

### WhatsApp not connecting
1. Check QR code generation: `openclaw whatsapp login`
2. Verify credentials: `ls -la /home/openclaw/.openclaw/credentials/whatsapp/`
3. Restart gateway: `openclaw gateway restart`

### Permission denied errors
1. Check sudoers: `sudo cat /etc/sudoers.d/openclaw`
2. Verify ownership: `sudo chown -R openclaw:openclaw /home/openclaw`
3. Test sudo: `sudo -u openclaw sudo systemctl status`

## Migration Notes

When migrating from old setup (clawdbot user):
1. Update all paths from `/home/clawdbot/` to `/home/openclaw/`
2. Update systemd service files
3. Restart all services
4. Verify webhook endpoints
5. Test PR auto-deployment

---

**Last updated:** 2026-01-31
**Maintainer:** Toni Bot
