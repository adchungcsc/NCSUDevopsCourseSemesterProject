#!/bin/bash

# Exit on error
set -e

# Trace commands as we run them:
set -x

# wait for apt get lock
while sudo fuser /var/{lib/{dpkg,apt/lists,dpkg/lock-frontend},cache/apt/archives}/lock >/dev/null 2>&1; do
           sleep 1
done

sudo /usr/bin/apt-get update "$@" ;

# redis
sudo apt-get -y install redis-server
sudo sed -i 's/supervised no/supervised systemd/g' /etc/redis/redis.conf
sudo sed -i 's/bind 127.0.0.1 ::1/bind 0.0.0.0/g' /etc/redis/redis.conf
sudo systemctl restart redis

# node js
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
while sudo fuser /var/{lib/{dpkg,apt/lists,dpkg/lock-frontend},cache/apt/archives}/lock >/dev/null 2>&1; do
           sleep 1
done
sudo apt-get install nodejs -y
while sudo fuser /var/{lib/{dpkg,apt/lists,dpkg/lock-frontend},cache/apt/archives}/lock >/dev/null 2>&1; do
           sleep 1
done
sudo apt-get install -y git
git clone -b master https://github.com/chrisparnin/checkbox.io-micro-preview.git
cd checkbox.io-micro-preview
npm install
sudo npm install -g -y pm2
npm --prefix /home/vagrant/agent install
# In checkbox.io-micro-preview
pm2 start index.js
