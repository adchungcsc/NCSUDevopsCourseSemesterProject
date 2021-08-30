#!/usr/bin/env node
const yargs = require('yargs');
const jenkins = require('jenkins')({ baseUrl: 'http://admin:admin@192.168.33.20:9000/', crumbIssuer: true, promisify: true });

(async () => {

    yargs
        .commandDir('./commands')
        .version()
        .demandCommand(1, 'Did you forget to specify a command?')
        .recommendCommands()
        .showHelpOnFail(true, 'Specify --help for available options')
        .strict(true)
        .help()
        .wrap(yargs.terminalWidth())
        .argv
})();

