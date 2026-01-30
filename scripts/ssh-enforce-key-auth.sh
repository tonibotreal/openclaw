#!/bin/bash
# SSH Security Hardening: Enforce Key-Based Authentication Only
# Disables password authentication to prevent brute force attacks

set -e

echo "=== SSH Security Hardening ==="
echo "This will disable password authentication and enforce key-based auth only."
echo ""

# Check if SSH keys are present
if [ ! -f /root/.ssh/authorized_keys ] || [ ! -s /root/.ssh/authorized_keys ]; then
    echo "ERROR: No SSH keys found in /root/.ssh/authorized_keys"
    echo "Please set up SSH keys before running this script!"
    exit 1
fi

KEY_COUNT=$(grep -c "ssh-rsa\|ssh-ed25519\|ecdsa-sha2" /root/.ssh/authorized_keys 2>/dev/null || echo "0")
echo "Found $KEY_COUNT SSH key(s) configured."
echo ""

# Backup current config
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d-%H%M%S)
echo "Backup created: /etc/ssh/sshd_config.backup.*"

# Disable password authentication
sed -i "s/^#PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config
sed -i "s/^PasswordAuthentication yes/PasswordAuthentication no/" /etc/ssh/sshd_config

# Ensure PasswordAuthentication is set to no
grep -q "^PasswordAuthentication" /etc/ssh/sshd_config || echo "PasswordAuthentication no" >> /etc/ssh/sshd_config

# Also disable root login with password
sed -i "s/^#PermitRootLogin/PermitRootLogin/" /etc/ssh/sshd_config
sed -i "s/^PermitRootLogin yes/PermitRootLogin prohibit-password/" /etc/ssh/sshd_config

# Validate SSH config
if sshd -t; then
    echo "SSH configuration valid."
else
    echo "ERROR: SSH configuration invalid! Restoring backup..."
    cp /etc/ssh/sshd_config.backup.* /etc/ssh/sshd_config
    exit 1
fi

# Restart SSH service
echo "Restarting SSH service..."
systemctl restart sshd

echo ""
echo "=== SSH Hardening Complete ==="
echo "Password authentication is now DISABLED."
echo "Only SSH key authentication is allowed."
echo ""
echo "IMPORTANT: Keep your SSH terminal open and test a new connection"
echo "in a separate window to verify key-based access works!"
echo ""
echo "If locked out, restore with:"
echo "  sudo cp /etc/ssh/sshd_config.backup.* /etc/ssh/sshd_config"
echo "  sudo systemctl restart sshd"
