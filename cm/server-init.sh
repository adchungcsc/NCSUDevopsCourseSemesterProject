#!/bin/bash

# Exit on error
set -e

# Trace commands as we run them:
set -x

# Script used to initialize your ansible server after provisioning.
wget -q -O - https://pkg.jenkins.io/debian-stable/jenkins.io.key | sudo apt-key add -
sudo sh -c 'echo deb https://pkg.jenkins.io/debian-stable binary/ > \
    /etc/apt/sources.list.d/jenkins.list'
sudo apt-get update
sudo apt install python3-pip -y
sudo pip3 install pymongo
sudo pip3 install paramiko
# sudo add-apt-repository ppa:ansible/ansible
# sudo apt-get install ansible -y
# sudo apt install ansible -y
sudo pip3 install ansible
sudo apt-get install default-jre -y
sudo apt-get install -y jenkins
sudo apt install jenkins-job-builder -y
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt-get install -y ./google-chrome-stable_current_amd64.deb

sudo sed -i '$ d' /etc/default/jenkins
sudo bash -c 'echo JENKINS_ARGS=\"--webroot=/var/cache/jenkins/war --httpPort=9000\" >> /etc/default/jenkins'
sudo mkdir '/var/lib/jenkins/init.groovy.d'
sudo service jenkins restart