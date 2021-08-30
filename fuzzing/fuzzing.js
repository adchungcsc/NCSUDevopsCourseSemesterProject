require('random-js')
const {exec} = require("child_process");
const path = require('path');
const Bluebird = require('bluebird')
const fs = require('fs'),
    xml2js = require('xml2js'),
    chalk = require('chalk');
const parser = new xml2js.Parser();
const randomstring = require("randomstring");
const replace = require('replace-in-file');
const moveFile = require('move-file');
const https = require("https");

if (require.main === module) {
    console.log('Welcome to the fuzzer')
    const myArgs = process.argv.slice(2);
    if (myArgs.length < 1) {
        console.log('Please input required args (fuzz count)')
        process.exit(1);
    }
    console.log(`Running fuzz ${myArgs[0]} times`)
    main(myArgs[0]).then(() => console.log("DONE"))
}

async function cleanup(pathToCachedOriginal, targetFilePath) {
    console.log('Renaming the original file back to its original name.')
    console.log(`sudo cp ${pathToCachedOriginal} ${targetFilePath}`)
    fs.copyFileSync(pathToCachedOriginal, `${targetFilePath}`)
    console.log(`Dropping iTrust database if it exists`)
    exec('mysql -u root --password="admin" -e \'DROP DATABASE IF EXISTS iTrust2_test\'', {shell: false}, (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
        }
    });

}

async function setupITrust(storageDirectory) {
    console.log('Setting up iTrust (setting config file')
    //Create an application.yml file to configure iTrust
    await sleep(1000)
    fs.copyFileSync(`${storageDirectory}/iTrust2/src/main/resources/application.yml.template`, `${storageDirectory}/iTrust2/src/main/resources/application.yml`)
    //Set the password in the new application yaml file
    console.log(`Modifying ${storageDirectory}/iTrust2/src/main/resources/application.yml`)
    const options = {
        //Single file
        files: `${storageDirectory}/iTrust2/src/main/resources/application.yml`,
        //Replacement to make (string or regex)
        from: /password:/,
        to: 'password: admin',
    };
    try {
        // equivalent of sed
        let changedFiles = replace.sync(options);
        console.log('Modified files:', changedFiles.join(', '));
    } catch (error) {
        console.error('Error occurred:', error);
    }
}

async function main(c) {
    //Search workspace dir for iTrust. (May need to pull separate repo to isolate from jenkins build)
    // Do this in /tmp later so it deletes itself on reboot?
    const mutationsDirectory = "/home/vagrant/fuzzing/fuzzed"
    const storageDirectory = "/home/vagrant/fuzzing/iTrust"
    const rootDirectory = `${storageDirectory}/iTrust2`
    await setupITrust(storageDirectory)
    console.log(`Finding non-test java files in project in ${rootDirectory}/src/main`)
    const filesInProject = recursiveFindFilesByType(`${rootDirectory}/src/main`, 'java')
    console.log(`Found ${filesInProject.length} java files in project.`)
    // Cleanup mutations from previous run.
    console.log('Cleaning up mutations directory if it exists.')
    try {
        fs.rmdirSync(mutationsDirectory, {recursive: true});
    } catch (e) {
        console.log(`${mutationsDirectory} does not exist. No cleanup needed`)
    }
    // Test c number of times.
    let finalResults = []
    let failureCount = 0;
    for (let i = 1; i <= c; i++) {
        // Pick a random victim and fuzz
        let randomIndex = Math.floor(Math.random() * filesInProject.length)
        let victimFile = filesInProject[randomIndex]
        console.log("\n\n===================================")
        console.log(chalk.blueBright(`TEST NUMBER: ${i}`));
        console.log(`Chosen Victim: ${victimFile}`)
        console.log("===================================\n\n")
        // Fuzz the file and get the path to the temporarily renamed old file.
        let oldFilePath = fuzzFile(victimFile)
        // Run all tests for this instance
        let thisRunTests = []
        do { // Keep trying until program compiles if it fails to build
            // thisRunTests = await calculateTestPriority(`${rootDirectory}`, i)
            let thisRunTestsResults = {}
            try{
                thisRunTestsResults = await calculateTestPriority(`${rootDirectory}`, i)
            }catch(e){
                //Cleanup a failed test & fuzz a new random victim if it failed to compile
                await cleanup(oldFilePath, victimFile);
                console.log("\n\n===================================")
                console.log(chalk.red(`REVERTING CHANGES & RETRYING.\n`))
                console.log(chalk.gray('W̴̻̄h̵͈̆y̶̗͝ ̷̀͜ḧ̷̦́ä̸͉́v̸͍͗e̶͍͗n̸͍͂\'̵̗̀t̷͉̀ ̵̪̓ẏ̴͍o̴̚ͅu̷͎͗ ̵̓͜ạ̴̕ü̵̜t̸̠̑o̵͔̕m̸̉͜ă̵͍ţ̵̒ȩ̷̒d̸̙̊ ̸͖͝ĕ̵̫v̵̨̓e̷͕̿r̸̨͘y̸̛͕t̷͔͋h̶͈̒i̴͙͑n̸͉͛g̶̪͝ ̴̰͝y̷̫̚ẻ̵͚t̴̜̏'))
                console.log("===================================\n\n")
                continue;
            }
            thisRunTests = thisRunTestsResults.allTests;
            console.log(thisRunTests)
            console.log(thisRunTests.length)
            let atLeastOneFailure = thisRunTestsResults.isAnyFailures;
            console.log(`Were there any failures this run?: ${atLeastOneFailure}`)
            if ( atLeastOneFailure){
                failureCount++;
            }
            break;
        } while (true)

        // Persist the fuzzed file to mutations directory
        const thisInstanceMutationDirectory = `${mutationsDirectory}/${i}`
        // Make the directory for the mutation, then move the fuzzed file in that directory
        console.log('Move the fuzzed file to the mutation dir for storage..')
        console.log(`sudo mkdir -p ${thisInstanceMutationDirectory} && sudo mv ${victimFile} ${thisInstanceMutationDirectory}`)
        fs.mkdirSync(thisInstanceMutationDirectory, {recursive: true})
        const filePathTokens = victimFile.split('/');
        const actualFileName = filePathTokens[filePathTokens.length - 1];
        moveFile.sync(victimFile, `${thisInstanceMutationDirectory}/${actualFileName}`)
        // Rename the file back to its original status
        await cleanup(oldFilePath, victimFile)
        // Log what was done so that the data can be used.
        console.log(`COMPLETED ${thisRunTests.length} TESTS`)
        //console.log(thisRunTests)
        finalResults.push.apply(finalResults, thisRunTests)

    }
    
    let dict = {}

    for (let i = 0; i < finalResults.length; i++) {
        const res = finalResults[i]
        if (res.status === 'failed') {
            //Dict already has this key
            if (dict.hasOwnProperty(res.name)) {
                console.log(`Existing entry ${res.name} ${res.mutation_num}`)
                dict[res.name].mutations.push(res.mutation_num)
            } else {
                console.log(`New entry ${res.name}`)
                dict[res.name] = {mutations: [res.mutation_num]}
            }
        }else {
            if ( !dict.hasOwnProperty(res.name)) {
                dict[res.name] = {mutations: []}
            }
        }

    }
    //Sort
    const sortable = Object.entries(dict)
        .sort(([,a],[,b]) => b.mutations.length - a.mutations.length)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
    //floor it
    let usefulTestOutput = ''
    let percentFound = Math.floor(failureCount * 100/c);
    console.log(`Overall mutation coverage: ${failureCount}/${c} (${percentFound}%) mutations caught by the test suite.`)
    usefulTestOutput = usefulTestOutput.concat(`Overall mutation coverage: ${failureCount}/${c} (${percentFound}%) mutations caught by the test suite.\n`)
    console.log('Useful tests')
    usefulTestOutput = usefulTestOutput.concat(`Useful tests \n ============ \n`)
    console.log('============')
    for ( let testName in sortable) {
        // Output the number of mutations detected out of the num run + where to find mutated file.
        const firstLine = `${dict[testName].mutations.length}/${c} ${testName}`;
        usefulTestOutput = usefulTestOutput.concat(`${firstLine} \n`)
        console.log(firstLine)
        for ( let v in dict[testName].mutations) {
            const secondLine = `\t - /home/vagrant/fuzzing/fuzzed/${v}`;
            usefulTestOutput = usefulTestOutput.concat(`${secondLine} \n`)
            console.log(secondLine)
        }
    }

    const reportLocation = '/home/vagrant/fuzzing/UsefulTestsResults.txt'
    console.log(`Writing results to ${reportLocation}`)
    fs.writeFileSync(reportLocation, usefulTestOutput, (err) => {
        // In case of a error throw err.
        if (err) throw err;
    })
    //console.log(`DONE`)
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


function outputCatFact() {
    //cats from https://www.asciiart.eu/animals/cats
    const cats = [" _._     _,-'\"\"`-._\n" +
    "(,-.`._,'(       |\\`-/|\n" +
    "    `-.-' \\ )-`( , o o)\n" +
    "          `-    \\`_`\"'-",
        "      |\\      _,,,---,,_\n" +
        "ZZZzz /,`.-'`'    -.  ;-;;,_\n" +
        "     |,4-  ) )-,_. ,\\ (  `'-'\n" +
        "    '---''(_/--'  `-'\\_)   ",
        "    |\\__/,|   (`\\\n" +
        "  _.|o o  |_   ) )\n" +
        "-(((---(((--------",
        "           __..--''``---....___   _..._    __\n" +
        " /// //_.-'    .-/\";  `        ``<._  ``.''_ `. / // /\n" +
        "///_.-' _..--.'_    \\                    `( ) ) // //\n" +
        "/ (_..-' // (< _     ;_..__               ; `' / ///\n" +
        " / // // //  `-._,_)' // / ``--...____..-' /// / //",
        "      |\\      _,,,---,,_\n" +
        "ZZZzz /,`.-'`'    -.  ;-;;,_\n" +
        "     |,4-  ) )-,_. ,\\ (  `'-'\n" +
        "    '---''(_/--'  `-'\\_)"]
    let randomIndex = Math.floor(Math.random() * cats.length)
    console.log(cats[randomIndex])
    try {
        const url = 'https://catfact.ninja/fact';
        https.get(url, function (res) {
            let body = '';
            res.on('data', function (chunk) {
                body += chunk;
            });

            res.on('end', function () {
                const catFact = JSON.parse(body)['fact'];
                console.log(chalk.blue(`龴ↀ◡ↀ龴 ^⨀ᴥ⨀^ ${catFact}  =^..^=  ^ ↀ ᴥ ↀ ^`));
            });
        }).on('error', function (e) {
            console.log("Got an error: ", e);
        });
    } catch (e) {
        console.log(e)
        console.log('cat is stuck somewhere on the web :( try again later')
    }
}


async function calculateTestPriority(testsuite_dir, mutationNumber) {
    try {

        return new Promise(function (resolve, reject) {
            let mvn = exec('sudo mvn clean test | sudo tee maven.log', {shell: false, cwd: testsuite_dir,});
            console.log('Kicked off maven')
            mvn.stdout.pipe(process.stdout);
            mvn.stderr.pipe(process.stderr);


            mvn.once('exit', async (exitCode) => {
                console.log('Maven exit')
                let testReportBase = `${testsuite_dir}/target/surefire-reports/`;
                const mvnLog = fs.readFileSync(`${testsuite_dir}/maven.log`, 'utf8')
                console.log(mvnLog)
                if (mvnLog.includes('BUILD FAILURE') || mvnLog.includes('Compilation failure')) {
                    console.log(chalk.red(`Error: BUILD FAILED. TRYING AGAIN:\n`))
                    console.log(chalk.red('y̴̨͔̳̖͈̠͚͓͆̾̈́̎̆̏̀͠o̴͍̜̳̩̊̈̓̆͋͋̓͊u̴̱͖̤̭͛̑̂̈ ̴̡͚̣̈́͗̏͝f̴̡̲̱̱̲̩̞͎́͂̓ó̷̲͇ô̵̢̮̞͜l̴͔͉̹̰̼̺͔̈̋ͅ ̵̖̲͌̇w̷̛̪̭̻͉̌͛̒͂̔̿h̸͎̮̫̋̾a̶̙̔͒̃ţ̶͇̮̫̳̤̹̟̿̌ ̴̢̦̪̤͚̘̏̈́̌̑̆͘̕̕ͅͅḧ̶͉̲̠̤̥́̉͗͜͝a̴̡̡̛̗͗͆̒̐͐̍͝v̷̬̕ͅe̸͓̹͈̠̼̼̅͑͐̎͘͘ ̸̛̼͍̹̩̼͉̯̌̿̒y̷̅͌́̓̐͂̚͜͝ő̴̙ù̴̫̘̣͍̥ ̸̺̲̬͓̜͒̍͘ͅḑ̷̢͇̊̈͐̈́͆̓͐ò̵̧̢̧̲̙̳̜̻̈n̴̢̬̺̮̪͇̳̒͛ḛ̷͌̿̀̑'))
                    reject([])
                }
                //let finalFileCheck = `${testsuite_dir}/target/surefire-reports/TEST-edu.ncsu.csc.iTrust2.unit.UserTest.xml`;
                // Check if the file exists
                let fileExists = false
                do {
                    // Spin lock until the directory is ready (indicative of all tests completed).
                    // For some reason, the maven child process triggers the exit before it actually completes & makes the tests reports (could not find a better workaround or reason why this happens).
                    fileExists = fs.existsSync(testReportBase);
                    console.log(`${testReportBase} exist status: ${fileExists}`);
                    if (!fileExists) {
                        console.log('Tests not yet completed. Waiting 5 seconds and trying again.')
                        // outputCatFact()
                        await sleep(5000)
                    }
                } while (!fileExists);

                let fileCount = 0
                do {
                    // Spin lock until the directory is ready (indicative of all tests completed).
                    // For some reason, the maven child process triggers the exit before it actually completes & makes the tests reports (could not find a better workaround or reason why this happens).
                    fileCount = recursiveFindFilesByType(testReportBase, 'xml').length;
                    //console.log(`${testReportBase} exist status: ${fileExists}`);
                    if (fileCount !== 15) {
                        console.log('All files not present. Waiting 5 seconds and trying again.')
                        // outputCatFact()
                        await sleep(5000)
                    }
                } while (fileCount !== 15);

                //crab rave. tests completed
                console.log('Tests completed! (\\/) (°,,,,°) (\\/) (\\/) (°,,,,°) (\\/) (\\/) (°,,,,°) (\\/)');
                //Fetch all XML files (created by maven to report on tests)
                let testReports = recursiveFindFilesByType(testReportBase, 'xml');
                let allTests = [];
                let counter = 0;
                for (const reportPath of testReports) {
                    console.log(counter++);
                    console.log(reportPath)
                    let tests = await getTestResults(reportPath, mutationNumber);
                    //Append this run's tests to all tests run so far
                    allTests = allTests.concat(tests);
                }
                let atLeastOneFailure = false;
                allTests.sort((a, b) => {
                    if (a.status === "failed" && b.status === "failed") {
                        atLeastOneFailure = true
                        return a.time - b.time
                    } else if (a.status === "failed") {
                        atLeastOneFailure = true
                        return -1
                    } else if (b.status === "failed") {
                        atLeastOneFailure = true
                        return 1
                    } else {
                        return a.time - b.time
                    }
                }).forEach(e => console.log(e));
                resolve({allTests: allTests, isAnyFailures: atLeastOneFailure});
            });
        });


    } catch (e) {
        console.log(chalk.red(`Error: Calculating priority of tests:\n`) + chalk.grey(e.stack));
        console.log(chalk.red('y̴̨͔̳̖͈̠͚͓͆̾̈́̎̆̏̀͠o̴͍̜̳̩̊̈̓̆͋͋̓͊u̴̱͖̤̭͛̑̂̈ ̴̡͚̣̈́͗̏͝f̴̡̲̱̱̲̩̞͎́͂̓ó̷̲͇ô̵̢̮̞͜l̴͔͉̹̰̼̺͔̈̋ͅ ̵̖̲͌̇w̷̛̪̭̻͉̌͛̒͂̔̿h̸͎̮̫̋̾a̶̙̔͒̃ţ̶͇̮̫̳̤̹̟̿̌ ̴̢̦̪̤͚̘̏̈́̌̑̆͘̕̕ͅͅḧ̶͉̲̠̤̥́̉͗͜͝a̴̡̡̛̗͗͆̒̐͐̍͝v̷̬̕ͅe̸͓̹͈̠̼̼̅͑͐̎͘͘ ̸̛̼͍̹̩̼͉̯̌̿̒y̷̅͌́̓̐͂̚͜͝ő̴̙ù̴̫̘̣͍̥ ̸̺̲̬͓̜͒̍͘ͅḑ̷̢͇̊̈͐̈́͆̓͐ò̵̧̢̧̲̙̳̜̻̈n̴̢̬̺̮̪͇̳̒͛ḛ̷͌̿̀̑'))
    }
}

async function getTestResults(testReport, mutationNumber) {
    let contents = fs.readFileSync(testReport)
    let xml2json = await Bluebird.fromCallback(cb => parser.parseString(contents, cb));
    return readMavenXmlResults(xml2json, mutationNumber);
}

function readMavenXmlResults(result, mutationNumber) {
    var tests = [];
    for (var i = 0; i < result.testsuite['$'].tests; i++) {
        var testcase = result.testsuite.testcase[i];

        tests.push({
            name: testcase['$'].name,
            time: testcase['$'].time,
            status: testcase.hasOwnProperty('failure') ? "failed" : "passed",
            mutation_num: mutationNumber
        });
    }
    return tests;
}


/**
 * Find files in a directory by type
 * @param base base directory to search at
 * @param ext file extension (do not include . ie *.java should be java)
 * @param files internal use do not set
 * @param result internal use do not set
 * @returns {*[]} list of file paths that have that extension
 */
function recursiveFindFilesByType(base, ext, files, result) {
    files = files || fs.readdirSync(base)
    result = result || []

    files.forEach(
        function (file) {
            const newbase = path.join(base, file)
            if (fs.statSync(newbase).isDirectory()) {
                result = recursiveFindFilesByType(newbase, ext, fs.readdirSync(newbase), result)
            } else {
                if (file.substr(-1 * (ext.length + 1)) === '.' + ext) {
                    result.push(newbase)
                }
            }
        }
    )
    return result
}


function fuzzFile(filePath) {
    // Fuzz the file to the "random" spec (Keep a copy of the original to revert after test is done)
    console.log(`Doing the fuzz ${filePath}`)
    // Make a copy
    console.log(`sudo cp ${filePath} ${filePath}.ORIGINAL`)
    fs.copyFileSync(filePath, `${filePath}.ORIGINAL`)
    let lines = []
    try {
        // Read in all the lines and store each line as an entry into an array.
        lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
        //console.log(lines)
    } catch (err) {
        console.error(err)
    }
    //Iterate thru
    let fuzzedLineCount = 0;
    //console.log('Total lines' + lines.length)
    let changedLines = []
    lines.forEach((line) => {
        if (Math.random() <= .1 && fuzzedLineCount / lines.length < .1) {
            fuzzedLineCount += 1
            const newLine = mutateLine(line)
            // console.log(`changed ${line} to ${newLine}`)
            changedLines.push(newLine)
        } else {
            changedLines.push(line)
        }
    })
    let fuzzedLinePct = fuzzedLineCount/lines.length * 100
    console.log(`Fuzzed: ${fuzzedLinePct}% of lines`)
    const tmpFileName = `${filePath}.tmp`
    console.log(`Creating temporary file to store fuzzed contents ${tmpFileName}`)
    try {
        fs.writeFileSync(tmpFileName, changedLines.join('\n'))
    } catch (err) {
        console.log(err)
    }
    console.log(`Setting regular file to fuzzed version ${tmpFileName}`)
    console.log(`sudo mv ${tmpFileName} ${filePath}`)
    moveFile.sync(tmpFileName, filePath)
    //console.log(fuzzedLineCount)
    // Return old file path (changed name to _.java.ORIGINAL instead of _.java & save new one to the original's name) (chance of name collision is low in this use case so not going to acct.)
    return `${filePath}.ORIGINAL`
}

function mutateLine(line) {

    if (Math.random() <= .5) {
        if (line.includes('==')) {
            line = line.replace(/==/g, '!=')
        }
    }

    //Swap 0 with 1
    if (Math.random() <= .5) {
        line = line.replace(/0/g, '1')

    }

    //Change contents of strings
    if (Math.random() <= .5) {
        var randString = randomstring.generate({
            length: Math.floor(Math.random() * 10),
            charset: 'alphabetic'
        });
        line = line.replace(/"(.*?)"/g, `"${randString}"`)
    }

    //Swap < with >
    if (Math.random() <= .5) {
        if (!(line.includes('<') && line.includes('>'))) {
            line = line.replace(/</g, '>')
        }

    }

    //Swap true with false
    if (Math.random() <= .5) {
        line = line.replace(/true/g, 'false')

    }

    // Change && with ||
    if (Math.random() <= .5) {
        line = line.replace(/&&/g, '||')
    }
    return line;
}
