# Read Me
Sean Snively, Arno Dasgupta, Alex Chung

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

