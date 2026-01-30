#!/bin/bash
# Security: Disable CUPS Printing Service
# Closes TCP port 631 and reduces attack surface

set -e

echo "=== CUPS Service Disable ==="
echo "This will stop and disable the CUPS printing service."
echo ""

# Check current status
echo "Current CUPS status:"
systemctl is-active cups 2>/dev/null || echo "cups: inactive"
systemctl is-active cups-browsed 2>/dev/null || echo "cups-browsed: inactive"
echo ""

# Stop services
echo "Stopping CUPS services..."
systemctl stop cups 2>/dev/null || echo "cups already stopped"
systemctl stop cups-browsed 2>/dev/null || echo "cups-browsed already stopped"

# Disable from startup
echo "Disabling CUPS from auto-start..."
systemctl disable cups 2>/dev/null || echo "cups already disabled"
systemctl disable cups-browsed 2>/dev/null || echo "cups-browsed already disabled"

# Verify port is closed
echo ""
echo "Checking port 631 status..."
if netstat -tlnp 2>/dev/null | grep -q ":631"; then
    echo "WARNING: Port 631 still appears to be listening"
    netstat -tlnp | grep ":631" || true
else
    echo "Port 631 is now CLOSED."
fi

echo ""
echo "=== CUPS Disabled ==="
echo "Printing service has been stopped and disabled."
echo "TCP port 631 is now closed."
echo ""
echo "To re-enable if needed:"
echo "  sudo systemctl enable cups"
echo "  sudo systemctl start cups"
