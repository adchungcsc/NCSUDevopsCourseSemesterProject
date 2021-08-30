#!/bin/bash

# Exit on error
set -e

# Trace commands as we run them:
set -x

# redis
# wait for apt get lock
while sudo fuser /var/{lib/{dpkg,apt/lists,dpkg/lock-frontend},cache/apt/archives}/lock >/dev/null 2>&1; do
           sleep 1
done

sudo /usr/bin/apt-get update "$@" ;

sudo apt-get update
# wait for apt get lock
while sudo fuser /var/{lib/{dpkg,apt/lists,dpkg/lock-frontend},cache/apt/archives}/lock >/dev/null 2>&1; do
           sleep 1
done
sudo apt-get -y install redis-server
sudo sed -i 's/supervised no/supervised systemd/g' /etc/redis/redis.conf
sudo sed -i 's/bind 127.0.0.1 ::1/bind 0.0.0.0/g' /etc/redis/redis.conf
sudo systemctl restart redis

# node js
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
# wait for apt get lock
while sudo fuser /var/{lib/{dpkg,apt/lists,dpkg/lock-frontend},cache/apt/archives}/lock >/dev/null 2>&1; do
           sleep 1
done
sudo apt-get install nodejs -y
# wait for apt get lock
while sudo fuser /var/{lib/{dpkg,apt/lists,dpkg/lock-frontend},cache/apt/archives}/lock >/dev/null 2>&1; do
           sleep 1
done
sudo apt-get install -y git
sudo npm install -g -y pm2
# wait for apt get lock
while sudo fuser /var/{lib/{dpkg,apt/lists,dpkg/lock-frontend},cache/apt/archives}/lock >/dev/null 2>&1; do
           sleep 1
done
sudo apt-get install -y siege
# npm --prefix /bakerx/Monitoring/monitor install
