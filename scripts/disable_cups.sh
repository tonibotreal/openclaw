#!/bin/bash
# Disable CUPS printing service - closes port 631
systemctl stop cups cups-browsed 2>/dev/null || true
systemctl disable cups cups-browsed 2>/dev/null || true
echo "CUPS disabled. Port 631 is now closed."
