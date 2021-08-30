const chalk = require('chalk');
const sshSync = require('../lib/ssh');
const scpSync = require('../lib/scp');
const request = require('request');
const {runTest} = require("../fuzzing/fuzzing");
const {fuzzFile} = require("../fuzzing/fuzzing");
const {recFindByExt} = require("../fuzzing/fuzzing");
const {mutateString} = require("../fuzzing/fuzzing");
const {exec} = require("child_process");

exports.command = 'useful-tests';
exports.desc = 'identify useful tests in iTrust given github username and password/personal access token.';
exports.builder = yargs => {
    yargs.options({
        c: {
            describe: 'number of times to test',
            type: 'number',
            default: 1000
        },
        u: {
            describe: 'User name for jenkins',
            type: 'string',
            alias: 'gh-user',
            default: 'admin'
        },
        p: {
            describe: 'Password for jenkins',
            type: 'string',
            alias: 'gh-pass',
            default: 'admin'
        }
    });
};


exports.handler = async argv => {
    const {c, u, p} = argv;
    console.log(chalk.blueBright('Setting up fuzzing & test prioritization report...'));

    //Keep track of the tasks that have been completed so far
    const completedTests = []

    console.log(`${c} ${u} ${p}`)
    //Kick off fuzz
    console.log(chalk.blueBright('Pre run cleanup'));
    let result = sshSync(`sudo rm -rf /home/vagrant/fuzzing`, 'vagrant@192.168.33.20')
    if( result.error ) { console.log(result.error); process.exit( result.status ); }
    //Recursively SCP the fuzzing directory onto the server so that it can be run
    console.log(chalk.blueBright('Moving fuzzing scripts over..'));
    result = scpSync('fuzzing', 'vagrant@192.168.33.20:/home/vagrant', true)
    if( result.error ) { console.log(result.error); process.exit( result.status ); }
    console.log(chalk.blueBright('Setting up github repo directory'));
    result = sshSync(`sudo mkdir -p /home/vagrant/fuzzing/iTrust`, 'vagrant@192.168.33.20')
    if( result.error ) { console.log(result.error); process.exit( result.status ); }
    console.log(chalk.blueBright('Cloning github repo'));
    console.log(`sudo git clone https://${u}:${p}@github.ncsu.edu/engr-csc326-staff/iTrust2-v8.git /tmp/fuzzing/iTrust`)
    result = sshSync(`sudo git clone https://${u}:${p}@github.ncsu.edu/engr-csc326-staff/iTrust2-v8.git /home/vagrant/fuzzing/iTrust`, 'vagrant@192.168.33.20')
    if( result.error ) { console.log(result.error); process.exit( result.status ); }
    //install dependencies of fuzzing on the config-srv machine
    result = sshSync(`npm --prefix /home/vagrant/fuzzing install`, 'vagrant@192.168.33.20');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }
    //Now that fuzzing is moved over, set it up and run it.
    result = sshSync(`sudo node /home/vagrant/fuzzing/fuzzing.js ${c}`, 'vagrant@192.168.33.20');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }
};

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
