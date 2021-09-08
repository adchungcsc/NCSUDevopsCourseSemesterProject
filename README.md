# Read Me
Developed by:
[Sean Snively](https://github.com/seansnively), [Arno Dasgupta](https://github.com/arnod1121), [Alex Chung](https://github.com/adchungcsc)

For NCSU Undergraduate DevOps course instructed by [Dr. Chris Parnin](http://www.chrisparnin.me/). Received verbal approval to upload this to public GitHub account.

This project was developed throughout the duration of a semseter in three milestones. It demonstrates components of a functional pipeline.

### Project Milestone Demos

[Final Concise Demo](https://youtu.be/G8uOZHFInpc)

[Milestone 3](https://youtu.be/YCCO6PwoYaM)

[Milestone 2](https://www.youtube.com/watch?v=ljvxSZa7DAU)

[Milestone 1](https://www.youtube.com/watch?v=sANQI_sA6U0)

### Project Milestone Requirements

[Milestone 3 Requirements](https://github.com/CSC-DevOps/Course/blob/master/Project/Pipeline3.md)

[Milestone 2 Requirements](https://github.com/CSC-DevOps/Course/blob/master/Project/Pipeline2.md)

[Milestone 1 Requirements](https://github.com/CSC-DevOps/Course/blob/master/Project/Pipeline1.md)


High Level Architecture

![architecture](https://user-images.githubusercontent.com/45158195/131715882-03406253-552a-42b9-b5a2-313a511f7f14.png)

Followed the "automate everything" philosophy to have Jenkins pipeline setup automated on a virtualbox VM running locally on any given device. After the Jenkins server is provisioned and configured, it is ready for usage. Target virtualbox instances running locally for iTrust2 and checkbox.io must be provisioned and setup with an ansible inventory file that can be passed to the pipeline deploy. This same command for deploying locally can also be used to deliver to prod environment provided a valid inventory file is provided (one is generated during the automated GCP instance provisioning step). There is also canary analysis on checkbox.io using an agent that sends metrics to a redis message queue where it is monitored on a monitoring vm. 

## Features (including but not limited to)

- Automated Jenkins server setup (provision & configuration management & initial setup on a virtualbox instance)
- Automated provisioning of virtual box instances for nodejs server [checkbox.io](https://github.com/chrisparnin/checkbox.io) and spring application [iTrust2](https://github.com/ncsu-csc326/iTrust)
- Configuration management using Ansible for all applications (Jenkins, iTrust2, Checkbox.io)
- Working Jenkins pipeline configuration
- Automated build of projects
- Automated testing
- Automated js static analysis tool developed from scratch (demonstrate visitor pattern)
- Automated Java fuzzing tool developed from scratch
- Automated server deployment (iTrust2 & checkbox.io) to virtualbox instances
- Automated server delivery (iTrust2 & checkboix.io) to Google Cloud VMs.
- Canary analysis locally on Virtualbox instances

## Below are the READMEs and demo videos for each of the 3 Milestones in the semester. Start from the bottom and work your way up to see milestones in chron order (topmost is milestone 3 completed which built atop 2 which built atop 1). 

# MILESTONE 3 README

## Teamwork

For this milestone we did more tasks synchronously, working on multiple things at one time. This allowed for more efficient development time. However, close to the end of the milestone, it was all hands-on deck. We would meet almost every day after 5pm the last week of the milestone.

## Provision cloud instances

We used google cloud to provision our cloud instances. We initially ran into issues with authentication, but after looking at documents online, we found lots of good guides and were able to use Google's SDK for JS to make our VMs. After that, the next big issue was adding our ssh public keys to the vm so that we can ssh into them. That turned out to be easy if we added them upon creation of the VM.

## Deploy checkbox.io and iTrust
We had difficulty dynamically pulling the private key using the ansible inventory file provided. This required a partial rewrite of our deployment code as we couldn't bank on using a set private key for every interaction. The code dynamically fetches the ansible private key variable path for the given target host in the deploy command and automatically fixes home directory paths so that it can locate it on the host machine and position it properly on the guest machine (config-srv). The rewrite created some challenges as copying it over directly to the config server and chmod'ing it resulted in the config server blowing up (every SSH connection to it failed) which I think may have been caused by a file being linked and perms changed when they shouldn't have been. To fix this, we moved the private key to a staging area first and then copied it over which negated the need to CHMOD it to use it.

### iTrust
One of the main issues ran into during the deployment of iTrust was resolving multiple small errors that combined into large problems. The first problem was getting tomcat to reliably start from Ansible. For some reason, the shellscript bash ...{tomcat}.../startup.sh was being marked as a completed task even though a manual check showed that it was never launched approximately half the time. To fix that flakiness I created a service file for tomcat and launched that tomcat instance as a service. Another issue that I had was that I could never reach iTrust even after the tomcat logs said everything worked properly. This problem took quite a few hours and was fixed when I renamed the war file to iTrust2 from iTrust2...snapshot. I did not know that the name affected the root path to iTrust. After it worked on GCP, we tested it to work ona local VM that the teaching staff would evaluate us on and our playbook/scripts that worked perfectly on GCP didn't work locally. To fix that we had to dynamically set file paths in our playbook and tomcat.service file with the current ansible user, dynamically fetch the private key from the provided playbook, copy it over, and set the required permissions. We also had to create parent directories ahead of time for certain files and somethings like /etc/systemd/system did not exist on the local VM (despite both local and GCP running ubuntu 20.04).

### Checkbox.io
One of the main issues I ran into while deploying checkbox was nginx. It was a new technology and I didn't know how to configure it, but after looking at some guides I was able to figure out how to get checkbox started on port 3002 and display the correct html pages. The other setup for checkbox was the same from last milestone. 
Another issue we ran into on the last day was mongodb not installing. We were initially using apt-get but that went stale, so we had to set up mongodb another way. It wasn't too bad as the documentation on the website of mongodb was pretty good.

## Canary Analysis

In the canary analysis section, we extended code from the deploy and monitoring workshops. We learned about how to read machine metrics, send them to another machine, and do analysis on them. We did this while performing a stress test on a server. We also learned how to perform a statistical analysis based on similarities in data sets. 

During the development, we had to figure out how to know when to run analysis on our data. We solved this by running an interval to see if a message had been received in the last 5 seconds. If not, the analysis could be run. This worked since our blue and green servers send messages every second. 

Another problem we had to solve was how to use the Mann Whitney U test. We used the gist and guide given to calculate this. The results took some time to understand, but after that we were able to use it to do a statistical comparison on blue and green VMs. We ran into an issue with Memory Load where the numbers were so different that it would fail on a comparison from master master. As a result, we also decided to use the effect_size in our decision to see if a metric failed. We decided that if P < .05 && effect_size > .80 then we would fail the metric. This proved to work, as well as getting rid of memoryLoad and using something like transaction dropped as a network statistic. This reduced the flakiness of catching a metric that had a low p-value but also a low effect_size. This allowed for master master to pass consistently and master broken to fail consistently.


## Miscellaneous Technologies/Issues
We ran into issues when initializing our virtual machines when an apt or dpkg lock would stop us from installing packages using apt-get. We used advice from Trevor Brennan in Post-mortem chat and we were able to get rid of the apt-get locks. We just wait for the locks to be removed before doing anything with apt-get. In the moment it was difficult, but once we found the fix, it worked consistently.

## Screen Cast

Milestone 3 Screencast link: https://youtu.be/YCCO6PwoYaM

Final Demo Link: https://youtu.be/G8uOZHFInpc

Different parts of the project are labeled in the youtube video description along with timestamps.


# MILESTONE 2 README

The results of the 1000 test run are located in UsefulTestResults.txt at the root level of this project. Also, the resulting fuzzed files are in the fuzzed directory in this repository.
Teamwork

For this milestone we did more tasks synchronously, working on multiple things at one time. This allowed for more efficient development time. However, close to the end of the milestone it was all hands-on deck. We would meet almost every day after 5pm the last week of the milestone.
Static Analysis

In the static analysis section, we became more familiar with abstract syntax tree traversing. It was slightly challenging to figure out how to properly traverse the tree depending on the case, as well as for what fields to check for within the nodes. Adding the functionality to fail the build after a report was printed was not too challenging, although did require some planning when writing the code.
iTrust Build Job

For this task, we ran into many issues attempting to create credentials within Jenkins. The number of times our request body would be "invalid", or we were not sending the right information in the header caused us to waste many days on this small task. However, once that was done, the rest of the iTrust build job was relatively smooth sailing. I learned some new things about the pipeline dsl syntax and learned to use different plugins within the syntax. The only other issue we came across during this task was the cleanup stage. We were not too sure how to remove stray jetty and chrome processes, but we found things that worked. We also got stuck on dropping the MySQL database through the pipeline, but it turned out to be an easy fix as we had an issue with parameters for the command.
Test Suite Analysis

For this task, we ran into many challenges associated with getting to a point where we could actually fuzz iTrust in a consistent, replicable, and scalable way. Our first few attempts had quite a bit of flakines when operating. It would say that a file was moved, copied, or deleted but when we verified it after an inevitable break, the operation never actually occurred. One part of this was us treating the nodejs program as what it wasn't: a shell script. It took us a few days to finally get the functionality on the orchestration like picking, copying, moving, persisting, etc. We eventually resolved our issues by using nodejs the way nodejs is actually supposed to be done using its built in file libraries. We also had issues with getting our mvn clean test operation to actually work. The child process would report that its status as 'exit' and kick off the next ste before actually being done (the reports directory and XML results files were nonexistent at that time). We weren't able to figure out exactly why it was doing this (possibly due to it forking and spinning up other processes?) but were able to find a workaround by "health checking" the directory and the number of xml reports with a psuedo spin lock that checked the status every 5 seconds (and output a cat fact to the terminal to entertain the executor). Our final major challenge was our results which seemed to show that our fuzzing operations seldom caused test failure. We spent quite a bit of time thinking about this but came to an answer that was reasonable. Our fuzzing operations oftentimes do not apply to many of the files in iTrust which we verified by spot checking the results of fuzzing and some of the test cases we checked would not have caught some of our errors. Another challenge was using nodejs the correct way. We were too attached to trying things the synchronous way which lead to writing slow or bad nodejs code. We had to spend some time brushing up on async programming to write better code.
Miscellaneous Technologies/Issues

When working on all our JavaScript projects, we came across issues with JavaScript. We found that when making different calls, JavaScript would continue forward without waiting for the response of the command. This messed us up a lot in fuzzing when we would be waiting for commands to occur before the next operation. We attempted to use async/await but we found that we did not it know it well enough to avoid these weird synchronous issues. We got around this by making sleep commands or spewing random cat facts.
Screen Cast

Screen Cast link: https://www.youtube.com/watch?v=ljvxSZa7DAU

Different parts of the project are labeled in the youtube video description along with timestamps.

# MILESTONE 1 README/NOTES


Understanding Requirements

Our first task was to review the requirements and understand what our tasks will be. This was all new to us but reviewing the constraints and understanding the CM template helped us to make sense of what we are doing. After we completed our first couple issues our next task was to figure out how we would work.

Met daily for approximately 1-2 hours/day

We decided to all meet for 1 to 2 hours a day to work on the project together. We attacked problems as a group each day during peer programming sessions. We tried different solutions and helped each other debug. This project is so new to us, we found it useful to bounce ideas off of each other.
Provisioning

We had no issues with provisioning our VM to host our jenkins server and build environment.
Configuration Management

When starting to use Ansible, we came across issues of not actually knowing how to use it. We started looking at example modules and past workshops and we slowly got the hang of it. We also got confused on whether to run the ansible script in our VM or host computer, but after some discussions we found that the host computer was the right choice.

Shell Scripts weren't too hard for us to use as we were comfortable running them in the workshops. We did come across issues of the files being saved as CRLF rather than LF which caused small errors, but we quickly fixed that.

We found ourselves refreshing our javascript coding techniques when working on the different commands. This was fine as Alex was pretty experienced in it, and the rest of us caught up quickly.
Jenkins

We had trouble with getting jenkins job builder working and had to follow a proposed solution outlined in the Devops class discord chat involving fetching the API token and using that as the password. To do that we used NodeJS' HTTP request module to interface with the jenkins API after it was launched to request a token. First we hit the endpoint to get the jenkins crumb + session cookie then used that crumb + session cookie in a second request to hit the API endpoint to get a token using ES6's new async await behavior. We also had difficulty with getting our environment variables properly set during the Jenkins build which took us a few hours to work around. We eventually found the right documentation and tutorial online to properly set them and were able to move forward (and have our jenkins job build successfully)
Miscellaneous Technologies/Issues

Debugging (Virtualbox SSH timeout when healthy)

One frustration point for us was trying to ssh into our virtual machine after bakerx finished installing. Sometimes bakerx would finish before the virtual machine was ready to be set up. Then our next command to ssh into the machine would fail. This was less of a problem with our implementation and about the technologies we were using. Something that seemed to fix this problem was closing the browser tab which was routing to the IP address of the virtual machine. Remembering this step before running our script stayed in the back of our mind since this issue.

Screen Cast link: https://www.youtube.com/watch?v=sANQI_sA6U0
