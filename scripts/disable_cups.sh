# Disable CUPS Printing Service
# Closes port 631, reducing attack surface

echo 'Stopping CUPS printing service...'
systemctl stop cups
systemctl stop cups-browsed 2>/dev/null || true

echo 'Disabling CUPS at boot...'
systemctl disable cups
systemctl disable cups-browsed 2>/dev/null || true

echo 'CUPS disabled. Port 631 is now closed.'
echo 'Verify with: sudo netstat -tlnp | grep 631'

