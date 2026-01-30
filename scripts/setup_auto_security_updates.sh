# Automated Security Updates Configuration
# Installs and configures unattended-upgrades for automatic security patches

echo 'Installing unattended-upgrades...'
apt-get update
apt-get install -y unattended-upgrades apt-listchanges

echo 'Configuring automatic security updates...'
cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
// Automatically upgrade packages from these origin patterns
Unattended-Upgrade::Allowed-Origins {
    ${distro_id}:${distro_codename}-security;
    ${distro_id}ESMApps:${distro_codename}-apps-security;
    ${distro_id}ESM:${distro_codename}-infra-security;
};

// Remove unused automatically installed kernel-related packages
Unattended-Upgrade::Remove-Unused-Kernel-Packages true;

// Remove unused dependencies
Unattended-Upgrade::Remove-Unused-Dependencies true;

// Automatically reboot WITHOUT CONFIRMATION if necessary
Unattended-Upgrade::Automatic-Reboot false;

// Email address for notifications (optional - leave empty if not needed)
// Unattended-Upgrade::Mail ;

// Verbose logging
Unattended-Upgrade::Verbose false;
EOF

echo 'Enabling unattended-upgrades...'
dpkg-reconfigure -plow unattended-upgrades

echo 'Testing unattended-upgrades...'
unattended-upgrade --dry-run

echo ''
echo 'Automated security updates configured!'
echo 'Status: sudo systemctl status unattended-upgrades'
echo 'Logs: /var/log/unattended-upgrades/'

