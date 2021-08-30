const child = require('child_process');
const chalk = require('chalk');
const scpSync = require('../lib/scp');
const sshSync = require('../lib/ssh');
const request = require('request');
const { string } = require('yargs');
const path = require('path');
const os = require('os');
const fs = require("fs");
const ini = require('ini');


exports.command = 'deploy project';
exports.desc = 'Deploy project to cloud -> pipeline deploy [iTrust][checkbox.io] -i [ANSIBLE .INI FILE]';
exports.builder = yargs => {
    yargs.options({
        project: {
            describe: 'name of project to deploy to Google CLoud Platform [iTrust][checkbox.io]',
            type: 'string',
        },
        i: {
            describe: 'Path to desired ansible .ini file for connecting to GCP',
            type: 'string',
            demandOption: true
        },
    });
};


exports.handler = async argv => {
    const { project, i } = argv;

    (async () => {
        await run(project, i);
    })();

};


async function run(project, iniFilePath){
    console.log(`${project} ${iniFilePath}`)
    const raw_inventory_file_path = iniFilePath
    // iniFilePath = `/bakerx/${iniFilePath}`;

    //Find where the private key is locally from the given ansible ini file
    let rawPrivateKeyPath = "~/.ssh/id_rsa"
    let localPrivateKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa')
    let remotePrivateKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa') //DEFAULT TO ~/.ssh/id_rsa
    const lines = fs.readFileSync(raw_inventory_file_path).toString().split("\n");
    for(let lineNumber in lines) {
        if(lines[lineNumber] === `[${project.toLowerCase()}]`) {
            //Grab the next line after the target name to get its configurations
            const lineTokens = lines[++lineNumber].split(" ")
            for (const tokenNumber in lineTokens) {
                if (lineTokens[tokenNumber].includes('ansible_ssh_private_key_file=')) {
                    //Get value after key
                    //May not work if spaces exist before or after = but that's not part of the schema so not going to accomodate for it.
                    rawPrivateKeyPath = lineTokens[tokenNumber].split('=')[1]

                    if(rawPrivateKeyPath.charAt(0) === "~"){
                        remotePrivateKeyPath = path.join('/home/vagrant', rawPrivateKeyPath.substr(1))
                        localPrivateKeyPath = path.join(os.homedir(), rawPrivateKeyPath.substr(1))
                    }
                    console.log(rawPrivateKeyPath)
                    console.log(remotePrivateKeyPath)
                    break
                }
            }
        }
    }
    let privateKeyDirectory = rawPrivateKeyPath.substr(0, rawPrivateKeyPath.lastIndexOf("/"))
    //Remove homedir set
    privateKeyDirectory = privateKeyDirectory.indexOf('~/') !== -1 ? privateKeyDirectory.substr(1, privateKeyDirectory.length) : privateKeyDirectory
    console.log(privateKeyDirectory)
    //Copy SSH key from host over to config-srv so that the ansible playbook can use it (the one registered with the GCP VM)

    console.log(chalk.blueBright(`Setting up items for SSH key directory`));
    let result = sshSync(`mkdir -p /home/vagrant${privateKeyDirectory}`, `vagrant@192.168.33.20`)
    if( result.error ) { process.exit( result.status ); }

    // result = sshSync(`sudo chmod 777 /home/vagrant${privateKeyDirectory}`, `vagrant@192.168.33.20`)
    // if( result.error ) { process.exit( result.status ); }
    const key_path_tokens = localPrivateKeyPath.split("/")
    const key_name = key_path_tokens[key_path_tokens.length - 1]

    result = scpSync(`${localPrivateKeyPath}`, `${key_name}`)
    if( result.error ) { process.exit( result.status ); }

    console.log(chalk.blueBright(`Copying over registered SSH key ${key_name} (specified in ansible .ini configuration file) (MUST be registered with the target VM)`));
    result = scpSync(key_name, `vagrant@192.168.33.20:${remotePrivateKeyPath}`)
    if( result.error ) { process.exit( result.status ); }

    //Change settings for id_rsa key
    console.log(chalk.blueBright(`Setting private key permissions`));
    result = sshSync(`chmod 600 ${remotePrivateKeyPath}`, `vagrant@192.168.33.20`)
    if( result.error ) { process.exit( result.status ); }

    console.log(chalk.blueBright('Moving ansible inventory file to configuration server'));
    result = scpSync(`${raw_inventory_file_path}`, 'vagrant@192.168.33.20:/home/vagrant/')
    if( result.error ) { process.exit( result.status ); }
    console.log(chalk.blueBright('Moving playbook file to configuration server'));
    result = scpSync('prodDeploy', 'vagrant@192.168.33.20:/home/vagrant', true)
    if( result.error ) { process.exit( result.status ); }

    console.log(chalk.blueBright('Kicking off ansible playbook'));
    const path_tokens = raw_inventory_file_path.split("/")
    const inventoryFileName = path_tokens[path_tokens.length - 1]

    result = scpSync('prodDeploy/ansible.cfg', 'vagrant@192.168.33.20:/home/vagrant')
    if( result.error ) { process.exit( result.status ); }
    //Build based on project
    if(project === "iTrust"){
        // console.log(chalk.blueBright('Moving ansible inventory file to configuration server'));
        // result = scpSync(`${raw_inventory_file_path}`, 'vagrant@192.168.33.20:/home/vagrant/')
        // if( result.error ) { process.exit( result.status ); }
        // console.log(chalk.blueBright('Moving playbook file to configuration server'));
        // result = scpSync('prodDeploy', 'vagrant@192.168.33.20:/home/vagrant', true)
        // if( result.error ) { process.exit( result.status ); }
        console.log(chalk.blueBright('Configuring iTrust'));
        result = sshSync(`bash /home/vagrant/prodDeploy/run-ansible.sh /home/vagrant/prodDeploy/iTrust-prod.yml /home/vagrant/${inventoryFileName}`, `vagrant@192.168.33.20`)
        if( result.error ) { process.exit( result.status ); }
    }else if(project === "checkbox.io"){

        let filePath = '/bakerx/prodDeploy/checkbox-prod.yml';

        console.log(chalk.blueBright('Running ansible script...'));
        result = sshSync(`/bakerx/cm/run-ansible.sh ${filePath} /home/vagrant/${inventoryFileName}`, 'vagrant@192.168.33.20');
        if( result.error ) { process.exit( result.status ); }
        //Add an arbitrary wait so that the vm is ready after being restarted so that deploy can work.
    }
}