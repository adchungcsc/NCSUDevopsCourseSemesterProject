const chalk = require('chalk');
const sshSync = require('../lib/ssh');
const scpSync = require('../lib/scp');
const request = require('request');
const {exec} = require("child_process");

exports.command = 'build name';
exports.desc = 'Run build on checkbox.io with given username and password.';
exports.builder = yargs => {
    yargs.options({
        name: {
            describe: 'Name of service to run',
            type: 'string'
        },
        u: {
            describe: 'User name for jenkins',
            type: 'string',
            default: 'admin'
        },
        p: {
            describe: 'Password for jenkins',
            type: 'string',
            default: 'admin'
        }
    });
};


exports.handler = async argv => {
    const {name, u, p} = argv;

    console.log(chalk.blueBright('Moving jenkins_jobs.ini script over..'));
    result = scpSync('jenkins_jobs.ini', 'vagrant@192.168.33.20:/home/vagrant');
    if (result.error) {
        console.log(result.error);
        process.exit(result.status);
    }
    result = sshSync('sudo mv /home/vagrant/jenkins_jobs.ini /etc/jenkins_jobs', 'vagrant@192.168.33.20');

    if (result.error) {
        console.log(result.error);
        process.exit(result.status);
    }
    if ( name == "iTrust") {
        runiTrust(u, p)

    } else if ( name == "checkbox.io") {
        runCheckBox(u, p);
    } else {
        console.log("INVALID NAME " + name)
    }
    

};

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
                        resolve(token_value)
                    },
                );
            },
        );
    })
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function runiTrust(user, pass) {
    //console.log('Entered iTrust function')
    await sleep(5000);
    const token = await get_token('admin', 'admin')
    const job = `jenkins-jobs --user ${user} --password ${token} update pipeline-iTrustconfig.yaml`;
    console.log(job);
    console.log(chalk.blueBright('Moving yaml file over...'));
    result = scpSync('pipeline-iTrustconfig.yaml', 'vagrant@192.168.33.20:/home/vagrant/');
    if (result.error) {
        console.log(result.error);
        process.exit(result.status);
    }

    console.log(chalk.blueBright('Building jenkins build job...'));
    result = sshSync(job, 'vagrant@192.168.33.20');
    if (result.error) {
        process.exit(result.status);
    }

    console.log(chalk.blueBright('Triggering jenkins build job...'));
    exec("node ./trigger_build.js iTrust", (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
}

async function runCheckBox(user, pass) {
    // Wait to avoid hitting jenkins before it's ready
    //await sleep(5000);
    const token = await get_token('admin', 'admin')
    const job = `jenkins-jobs --user ${user} --password ${token} update pipeline-config.yaml`;
    console.log(job);
    console.log(chalk.blueBright('Moving yaml and analysis.js file over...'));
    result = scpSync('pipeline-config.yaml', 'vagrant@192.168.33.20:/home/vagrant/');
    if (result.error) {
        console.log(result.error);
        process.exit(result.status);
    }

    result = scpSync('analysis.js', 'vagrant@192.168.33.20:/home/vagrant/');
    result = sshSync('sudo mv /home/vagrant/analysis.js /var/lib/jenkins/', 'vagrant@192.168.33.20');
    if (result.error) {
        console.log(result.error);
        process.exit(result.status);
    }

    console.log(chalk.blueBright('Building jenkins build job...'));
    result = sshSync(job, 'vagrant@192.168.33.20');
    if (result.error) {
        process.exit(result.status);
    }

    console.log(chalk.blueBright('Restarting mongodb..'));
    result = sshSync('sudo service mongodb start', 'vagrant@192.168.33.20');
    if (result.error) {
        process.exit(result.status);
    }

    console.log(chalk.blueBright('Triggering jenkins build job...'));
    exec("node ./trigger_build.js checkbox.io", (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
}