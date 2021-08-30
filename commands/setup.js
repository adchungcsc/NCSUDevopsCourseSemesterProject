const child = require('child_process');
const chalk = require('chalk');
const scpSync = require('../lib/scp');
const sshSync = require('../lib/ssh');
const request = require('request');
const { string } = require('yargs');

exports.command = 'setup';
exports.desc = 'Provision and configure the configuration server';
exports.builder = yargs => {
    yargs.options({
        privateKey: {
            describe: 'Install the provided private key on the configuration server',
            type: 'string'
        },
        u: {
            describe: 'User name for GitHub',
            type: 'string',
            alias: 'gh-user',
            demandOption: true
        },
        p: {
            describe: 'Password for GitHub',
            type: 'string',
            alias: 'gh-pass',
            demandOption: true
        }
    });
};


exports.handler = async argv => {
    const { privateKey, u, p } = argv;

    (async () => {

        await run(privateKey, u, p);

    })();

};

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function run(privateKey, u, p) {

    console.log(chalk.greenBright('Installing configuration server!'));

    console.log(chalk.blueBright('Provisioning configuration server...'));
    let result = child.spawnSync(`bakerx`, `run config-srv focal --ip 192.168.33.20 --memory 4096 --sync`.split(' '), {shell:true, stdio: 'inherit'} );
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Moving files over...'));
    result = scpSync('.vault-pass', 'vagrant@192.168.33.20:/home/vagrant/');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    console.log(chalk.blueBright('Running init script...'));
    result = sshSync('/bakerx/cm/server-init.sh', 'vagrant@192.168.33.20');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }


    console.log(chalk.blueBright('Sending security script...'));
    result = scpSync('basic-security.groovy', 'vagrant@192.168.33.20:/home/vagrant');
    result = sshSync('sudo mv /home/vagrant/basic-security.groovy /var/lib/jenkins/init.groovy.d', 'vagrant@192.168.33.20');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }

    result = sshSync('sudo mv /home/vagrant/basic-security.groovy /var/lib/jenkins/init.groovy.d', 'vagrant@192.168.33.20');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }


    console.log(chalk.blueBright('Restarting Jenkins..'));
    result = sshSync('sudo service jenkins restart', 'vagrant@192.168.33.20');
    if( result.error ) { console.log(result.error); process.exit( result.status ); }



    let filePath = '/bakerx/cm/playbook.yml';
    let inventoryPath = '/bakerx/cm/inventory.ini';

    console.log(chalk.blueBright('Running ansible script...'));
    result = sshSync(`/bakerx/cm/run-ansible.sh ${filePath} ${inventoryPath}`, 'vagrant@192.168.33.20');
    if( result.error ) { process.exit( result.status ); }
    console.log(chalk.blueBright('Waiting for jenkins to be healthy...'))
    //await sleep(20000);
    console.log(chalk.blueBright('Fetching API token from jenkins...'))
    var arr = await get_token('admin', 'admin')
    var crumb = arr[0]
    var token = arr[1]
    var cookies = arr[2]
    console.log(chalk.blueBright('Sending Github credentials to jenkins...'))
    var resp = await send_credentials(crumb, token, cookies, u, p)
}

function get_token(username, password) {
    return new Promise((resolve, reject) => {
        let jenkins_crumb = ''
        let token_value = ''
        const
            crumb_url = `http://${username}:${password}@192.168.33.20:9000/crumbIssuer/api/json`
        const
            token_url = `http://${username}:${password}@192.168.33.20:9000/me/descriptorByName/jenkins.security.ApiTokenProperty/generateNewToken?newTokenName=JohnCena`

        request(
            {
                url: crumb_url,
            },
            function (error, response, body) {
                if (error) reject(error);
                if (response.statusCode != 200) {
                    reject('Invalid status code <' + response.statusCode + '>');
                }
                // console.log('COOKIES')
                const cookies = response.headers['set-cookie'];
                // console.log(cookies)
                // console.log('CRUMB')
                jenkins_crumb = JSON.parse(body).crumb
                // console.log(jenkins_crumb)
                // Not the most intelligent way of using this but oh well
                request(
                    {
                        method: 'POST',
                        url: token_url,
                        headers: {
                            "Jenkins-Crumb": jenkins_crumb,
                            "Cookie": cookies
                        }
                    },
                    function (error, response, body) {
                        if (error) reject(error);
                        if (response.statusCode != 200) {
                            reject('Invalid status code <' + response.statusCode + '>');
                        }
                        // console.log('TOKEN')
                        token_value = JSON.parse(body).data.tokenValue
                        // console.log(token_value)
                        resolve([jenkins_crumb, token_value, cookies])
                    },
                );
            },
        );
    })
}

function send_credentials(crumb, token, cookies, u, p) {
    var send_data = {
        "json": JSON.stringify({
            "": "0", 
            "credentials": {
                "scope": "GLOBAL",
                "id": "NCSU_GitHub",
                "username": u,
                "password": p,
                "description": "GitHub Credentials",
                "$class": "com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl"
            }
        })
    }
   

    return new Promise((resolve, reject) => {
        const add_cred_url = `http://admin:${token}@192.168.33.20:9000/credentials/store/system/domain/_/createCredentials`
       
        request(
            {
                method: 'POST',
                url: add_cred_url,
                headers: {
                    "Jenkins-Crumb": crumb,
                    "cookie": cookies
                },
                referrer: add_cred_url,
                referrerPolicy: "same-origin",
                form: send_data
            },
            function (error, response, body) {
                if (error) {
                    console.log(error)
                    reject(error);
                }
                if (response.statusCode != 200 && response.statusCode != 302) {
                    console.log(response.body);
                    reject('Invalid status code <' + response.statusCode + '>');

                }
                resolve(body);
            },
        );
        
    })
}

