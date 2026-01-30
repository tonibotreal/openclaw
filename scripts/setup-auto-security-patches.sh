#!/bin/bash
# Automated Security Patch Management Setup
# Configures unattended-upgrades for automatic security updates

set -e

echo "=== Automated Security Patch Management ==="
echo "Setting up automatic security updates..."
echo ""

# Install required packages
echo "Installing unattended-upgrades..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y unattended-upgrades apt-listchanges

# Create configuration
echo "Configuring automatic updates..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades << UPGRADES_EOF
// Automatically upgrade packages from security repositories
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

// Remove unused automatically installed kernel-related packages
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";

// Remove unused dependencies
Unattended-Upgrade::Remove-Unused-Dependencies "true";

// Do NOT automatically reboot (set to "true" if you want auto-reboot)
Unattended-Upgrade::Automatic-Reboot "false";

// Email for notifications (optional)
// Unattended-Upgrade::Mail "root";
// Unattended-Upgrade::MailReport "on-change";

// Enable verbose logging
Unattended-Upgrade::Verbose "false";
UPGRADES_EOF

# Enable the service
echo "Enabling unattended-upgrades service..."
dpkg-reconfigure -plow unattended-upgrades

# Start the service
systemctl start unattended-upgrades

# Test configuration
echo ""
echo "Testing configuration (dry-run)..."
unattended-upgrade --dry-run 2>&1 | head -20 || true

echo ""
echo "=== Setup Complete ==="
echo "Automatic security updates are now configured!"
echo ""
echo "Monitoring commands:"
echo "  Status:  sudo systemctl status unattended-upgrades"
echo "  Logs:    sudo tail -f /var/log/unattended-upgrades/unattended-upgrades.log"
echo "  Dry-run: sudo unattended-upgrade --dry-run"
echo ""
echo "Update schedule: Daily (controlled by /etc/apt/apt.conf.d/20auto-upgrades)"
