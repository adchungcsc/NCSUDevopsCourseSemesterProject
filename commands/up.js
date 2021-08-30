// Imports the Google Cloud client library
const Compute = require('@google-cloud/compute');
const fetch = require('node-fetch');
const {exit} = require('yargs');
const sshSync = require('../lib/gcpssh')
const path = require('path');
const os = require('os');
const fs = require('fs');
const chalk = require('chalk');

exports.command = 'prod up';
exports.desc = 'Provision and configure the cloud server';
exports.builder = yargs => {
    yargs.options({});
};

// Creates a client
const compute = new Compute();
//Change per person running script
const userName = `devops`;
let inventoryString = '';

//Names of the VMs - Change in one place
const iTrustname = 'itrust-vm';
const checkboxName = 'checkbox-vm';
const monitorName = 'monitor-vm'

async function createiTrustVM() {
    const name = iTrustname;
    const zone = compute.zone('us-east1-b');
    //Uses sshkey from your host computer and adds it to the metadata.
    let pathToRSA = path.join(os.homedir(), '.ssh', 'id_rsa.pub');
    let rsaKey = fs.readFileSync(pathToRSA).toString().trim();
    // Create a new VM, using default ubuntu image. The startup script
    // installs apache and a custom homepage.
    const config = {
        os: 'ubuntu-20',
        http: true,
        metadata: {
            items: [
                {
                    key: 'startup-script',
                    value: `#! /bin/bash
              touch helloworld`,
                },
                {
                    key: "ssh-keys",
                    value: `${userName}:${rsaKey}`,
                },
            ],
        },
    };

    const vm = zone.vm(name);
    let [, operation] = [];
    try {
        console.log(`Creating VM ${name}...`);
        [, operation] = await vm.create(config);
    } catch (e) {
        console.log(e.message);
        exit(1);
    }

    console.log(`Polling operation ${operation.id}...`);
    await operation.promise();

    console.log('Acquiring VM metadata...');
    const [metadata] = await vm.getMetadata();

    // External IP of the VM.
    const ip = metadata.networkInterfaces[0].accessConfigs[0].natIP;
    console.log(`Booting new VM with IP http://${ip}...`);

    // Ping the VM to determine when the HTTP server is ready.
    //If you get rid of the apache start up script, then this ping won't be needed
    //console.log('Operation complete. Waiting for IP');
    //await pingVM(ip);

    console.log(`\n${name} created succesfully`);
    inventoryString += `[itrust]\n${ip} ansible_ssh_private_key_file=~/.ssh/id_rsa ansible_user=${userName} ansible_ssh_common_args='-o StrictHostKeyChecking=no'\n\n`;
    createCheckboxVM();
}

async function createCheckboxVM() {
    const name = checkboxName;
    const zone = compute.zone('us-east1-b');
    //Uses sshkey from your host computer and adds it to the metadata.
    let pathToRSA = path.join(os.homedir(), '.ssh', 'id_rsa.pub');
    let rsaKey = fs.readFileSync(pathToRSA).toString().trim();
    // Create a new VM, using default ubuntu image. The startup script
    // installs apache and a custom homepage.
    const config = {
        os: 'ubuntu-20',
        http: true,
        metadata: {
            items: [
                {
                    key: 'startup-script',
                    value: `#! /bin/bash
             # Installs python3 pip and pymongo
             touch helloworld`,
                },
                {
                    key: "ssh-keys",
                    value: `${userName}:${rsaKey}`,
                },
            ],
        },
    };

    const vm = zone.vm(name);
    let [, operation] = [];
    try {
        console.log(`Creating VM ${name}...`);
        [, operation] = await vm.create(config);
    } catch (e) {
        console.log(e.message);
        exit(1);
    }

    console.log(`Polling operation ${operation.id}...`);
    await operation.promise();

    console.log('Acquiring VM metadata...');
    const [metadata] = await vm.getMetadata();

    // External IP of the VM.
    const ip = metadata.networkInterfaces[0].accessConfigs[0].natIP;
    console.log(`Booting new VM with IP http://${ip}...`);

    console.log(`\n${name} created succesfully`);

    inventoryString += `[checkbox]\n${ip} ansible_ssh_private_key_file=~/.ssh/id_rsa ansible_user=${userName} ansible_ssh_common_args='-o StrictHostKeyChecking=no'\n\n`;
    console.log(chalk.blueBright('Creating inventory.ini file...'));
    fs.writeFileSync('./inventory.ini', inventoryString);
    //createMonitorVM();
}

async function createMonitorVM() {
    const name = monitorName;
    const zone = compute.zone('us-east1-b');
    //Uses sshkey from your host computer and adds it to the metadata.
    let pathToRSA = path.join(os.homedir(), '.ssh', 'id_rsa.pub');
    let rsaKey = fs.readFileSync(pathToRSA).toString().trim();
    // Create a new VM, using default ubuntu image. The startup script
    // installs apache and a custom homepage.
    const config = {
        os: 'ubuntu',
        http: true,
        metadata: {
            items: [
                {
                    key: 'startup-script',
                    value: `#! /bin/bash
           # Installs apache and a custom homepage
              apt-get update
              apt-get install -y apache2
              cat <<EOF > /var/www/html/index.html
              <!doctype html>
              <h1>Hello World</h1>
              <p>This page was created from a simple start-up script!</p>
              sudo apt update
              sudo apt install software-properties-common
              sudo add-apt-repository ppa:deadsnakes/ppa
              sudo apt update
              sudo apt install python3.8`,
                },
                {
                    key: "ssh-keys",
                    value: `${userName}:${rsaKey}`,
                },
            ],
        },
    };

    const vm = zone.vm(name);
    let [, operation] = [];
    try {
        console.log(`Creating VM ${name}...`);
        [, operation] = await vm.create(config);
    } catch (e) {
        console.log(e.message);
        exit(1);
    }

    console.log(`Polling operation ${operation.id}...`);
    await operation.promise();

    console.log('Acquiring VM metadata...');
    const [metadata] = await vm.getMetadata();

    // External IP of the VM.
    const ip = metadata.networkInterfaces[0].accessConfigs[0].natIP;
    console.log(`Booting new VM with IP http://${ip}...`);

    // Ping the VM to determine when the HTTP server is ready.
    console.log('Operation complete. Waiting for IP');
    await pingVM(ip);

    console.log(`\n${name} created succesfully`);

    inventoryString += `[monitor]\n${ip} ansible_ssh_private_key_file=~/.ssh/id_rsa ansible_user=${userName}`;
}

/**
 * Poll a given IP address until it returns a result.
 * @param {string} ip IP address to poll
 */
async function pingVM(ip) {
    let exit = false;
    while (!exit) {
        await new Promise(r => setTimeout(r, 2000));
        try {
            const res = await fetch(`http://${ip}`);
            if (res.status !== 200) {
                throw new Error(res.status);
            }
            exit = true;
        } catch (err) {
            process.stdout.write('.');
        }
    }
}

exports.handler = async argv => {
    (async () => {
        await createiTrustVM();
    })();

};

// testFunc();
// createiTrustVM();
// result = sshSync('ls -a', `${userName}@34.75.137.191`);
// if( result.error ) { console.log(result.error); process.exit( result.status ); }
