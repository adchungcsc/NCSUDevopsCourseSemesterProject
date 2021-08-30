#!/bin/bash

# Exit on error
set -e

# Trace commands as we run them:
set -x

# siege
siege -c15 -d2 -t60s --content-type="application/json" 'http://192.168.44.25:3000/preview POST < /bakerx/Monitoring/monitor/survey.json'
