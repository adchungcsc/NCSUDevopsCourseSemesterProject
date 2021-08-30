const child = require('child_process');
const chalk = require('chalk');
const scpSync = require('../lib/scp');
const sshSync = require('../lib/ssh');
const request = require('request');
const { string } = require('yargs');
const path = require('path');
const os = require('os');
const survey = require('../Monitoring/monitor/survey.json')

exports.command = 'canary <master> <secondOption>';
exports.desc = 'Run canary analysis -> pipeline canary master master/broken';
exports.builder = yargs => {
    yargs.options({
        master: {
            describe: 'master',
            type: 'string',
            default: 'master',
            demandOption: 'true'
        },
        secondOption: {
            describe: 'master or broken',
            type: 'string',
            demandOption: 'true'
        },
    });
};


exports.handler = async argv => {
    const { master, secondOption } = argv;

    (async () => {
        await run(master, secondOption);
    })();

};



async function run(master, secondOption){
    console.log(`${master} and ${secondOption}`);
    console.log(chalk.greenBright('Setting up production environment!'));

    //Only need to npm install on monitor (agent is done on targets)
    console.log(chalk.greenBright('Installing monitoring dependencies...'));
    let result = child.spawnSync('npm --prefix Monitoring/monitor install', {shell:true, stdio: 'inherit'})
    if( result.error ) { console.log(result.error); process.exit( result.status ); }
    console.log(chalk.greenBright('Provisioning monitoring server...'));
    result = child.spawnSync(`bakerx`, `run monitor focal --ip 192.168.44.92 --sync --memory 1024`.split(' '), {shell:true, stdio: 'inherit'} );
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Running init script for monitor...'));
    result = sshSync('sudo bash /bakerx/cm/monitor.sh', 'vagrant@192.168.44.92');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Provisioning blue server...'));
    result = child.spawnSync(`bakerx`, `run blue focal --ip 192.168.44.25 --memory 1024`.split(' '), {shell:true, stdio: 'inherit'} );
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    //Blue = master what we know works, Green = Broken or Master
    console.log(chalk.blueBright('Moving init file over for blue...'));
    result = scpSync('cm/master-init.sh', 'vagrant@192.168.44.25:/home/vagrant/');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Moving agent files over for blue...'));
    result = scpSync('Monitoring/agent', 'vagrant@192.168.44.25:/home/vagrant/', true);
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Running init script for blue (master)...'));
    result = sshSync('sudo bash /home/vagrant/master-init.sh', 'vagrant@192.168.44.25');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    //Green stuff
    console.log(chalk.blueBright('Provisioning green server...'));
    result = child.spawnSync(`bakerx`, `run green focal --ip 192.168.44.30 --memory 1024`.split(' '), {shell:true, stdio: 'inherit'} );
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Moving init file over for green...'));
    result = scpSync(`cm/${secondOption}-init.sh`, 'vagrant@192.168.44.30:/home/vagrant/');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Moving agent files over for green...'));
    result = scpSync('Monitoring/agent', 'vagrant@192.168.44.30:/home/vagrant/', true);
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright(`Running init script for green (${secondOption})...`));
    result = sshSync(`sudo bash /home/vagrant/${secondOption}-init.sh`, 'vagrant@192.168.44.30');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Starting monitor...'));
    result = sshSync('pm2 start /bakerx/Monitoring/monitor/index.js', 'vagrant@192.168.44.92');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Running agent for blue (master)...'));
    result = sshSync('pm2 start /home/vagrant/agent/index.js -- blue', 'vagrant@192.168.44.25');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Starting siege for blue for 1 minute'));
    result = sshSync('sudo bash /bakerx/cm/siege-blue.sh', 'vagrant@192.168.44.92');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Stopping pm2 instance for blue'));
    result = sshSync(`pm2 stop all`, 'vagrant@192.168.44.25');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Running agent for green...'));
    result = sshSync(`pm2 start /home/vagrant/agent/index.js -- green`, 'vagrant@192.168.44.30');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Starting siege for green for 1 minute'));
    result = sshSync('sudo bash /bakerx/cm/siege-green.sh', 'vagrant@192.168.44.92');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Stopping pm2 instance for green'));
    result = sshSync(`pm2 stop all`, 'vagrant@192.168.44.30');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Waiting for canary results...'));
    result = sshSync(`sleep 5`, 'vagrant@192.168.44.92');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    result = sshSync(`cat canary_results.txt`, 'vagrant@192.168.44.92');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Stopping pm2 instance for monitor...'));
    result = sshSync(`pm2 stop all`, 'vagrant@192.168.44.92');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

}


