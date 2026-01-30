# SSH Hardening Script
# This script disables password authentication for SSH
# WARNING: Only run after verifying SSH keys are set up!

echo 'Disabling SSH password authentication...'
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config

echo 'Restarting SSH service...'
systemctl restart sshd

echo 'SSH hardening complete. Password authentication is now disabled.'
echo 'Verify you can connect via SSH key before closing this session!'

