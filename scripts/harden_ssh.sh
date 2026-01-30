#!/bin/bash
# =============================================================================
# SSH HARDENING SCRIPT
# Disables password authentication (use only when SSH keys are confirmed working)
# =============================================================================

set -e

echo "=============================================="
echo "🔒 SSH HARDENING SCRIPT"
echo "=============================================="
echo ""
echo "This will:"
echo "1. Disable password authentication for SSH"
echo "2. Ensure root can only login with keys (already set)"
echo "3. Disable empty passwords"
echo "4. Restart SSH service"
echo ""
echo "⚠️  CRITICAL: You MUST have working SSH key access before running this!"
echo ""
echo "Testing your SSH key access:"
echo "1. Open a NEW terminal/SSH session (keep this one open!)"
echo "2. SSH into this server using your key"
echo "3. If that works, come back here and run this script"
echo ""
read -p "Have you confirmed SSH key access works in a separate session? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo ""
    echo "❌ ABORTED: Please test SSH key access first!"
    echo ""
    echo "To test:"
    echo "  1. Open a new terminal"
    echo "  2. Run: ssh -i /path/to/your/key root@<server-ip>"
    echo "  3. If successful, run this script again"
    exit 0
fi

echo ""
echo "Step 1: Creating SSH config backup..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%Y%m%d_%H%M%S)

echo "Step 2: Applying security settings..."

# Disable password authentication
if grep -q "^PasswordAuthentication" /etc/ssh/sshd_config; then
    sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
else
    echo "PasswordAuthentication no" >> /etc/ssh/sshd_config
fi

# Ensure pubkey authentication is enabled
if grep -q "^PubkeyAuthentication" /etc/ssh/sshd_config; then
    sed -i 's/^PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
else
    echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config
fi

# Disable empty passwords
if grep -q "^PermitEmptyPasswords" /etc/ssh/sshd_config; then
    sed -i 's/^PermitEmptyPasswords.*/PermitEmptyPasswords no/' /etc/ssh/sshd_config
else
    echo "PermitEmptyPasswords no" >> /etc/ssh/sshd_config
fi

# Ensure root can only use keys
if grep -q "^PermitRootLogin" /etc/ssh/sshd_config; then
    sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
else
    echo "PermitRootLogin prohibit-password" >> /etc/ssh/sshd_config
fi

echo "Step 3: Testing SSH configuration..."
if sshd -t; then
    echo "✅ SSH configuration is valid"
else
    echo "❌ SSH configuration test failed!"
    echo "Restoring backup..."
    cp /etc/ssh/sshd_config.bak.* /etc/ssh/sshd_config
    exit 1
fi

echo "Step 4: Restarting SSH service..."
systemctl restart sshd

echo ""
echo "=============================================="
echo "✅ SSH HARDENING COMPLETE!"
echo "=============================================="
echo ""
echo "Applied settings:"
echo "  - PasswordAuthentication: NO"
echo "  - PubkeyAuthentication: YES"
echo "  - PermitEmptyPasswords: NO"
echo "  - PermitRootLogin: prohibit-password"
echo ""
echo "Your server now ONLY accepts SSH key authentication!"
echo ""
echo "To verify:"
echo "  - Try SSH from a new terminal with your key"
echo "  - Ensure password login is rejected"
echo ""
echo "If you get locked out, you can restore with:"
echo "  - Console access via Linode dashboard"
echo "  - Restore /etc/ssh/sshd_config from backup"
echo ""
