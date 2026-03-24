#!/bin/bash
cd /workspace/secure-dashboard
node server.js > /tmp/server.log 2>&1 &
sleep 3
cat /tmp/server.log
