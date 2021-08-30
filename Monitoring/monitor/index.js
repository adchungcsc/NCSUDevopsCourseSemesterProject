// websocket server that dashboard connects to.
const redis = require('redis');
const got = require('got');
const fs = require('fs');
const express = require('express');
// const path = require('path');
const app = express();
const survey = require('./survey.json')
const mannwhitneyu = require('./mannwhitneyu.js');
const { cpus } = require('os');
const { exit } = require('process');

/// Servers data being monitored.
var servers =
	[
		{ name: "blue", url: `http://192.168.44.25:3000/preview`, status: "#cccccc", scoreTrend: [0], txDrop: [], cpuLoad: [], statusCodes: [], latencies: [] },
		{name: "green",url:`http://192.168.44.30:3000/preview`, status: "#cccccc",  scoreTrend : [0], txDrop: [], cpuLoad: [], statusCodes: [], latencies: []}
	];

function start(app) {
	////////////////////////////////////////////////////////////////////////////////////////
	// DASHBOARD
	////////////////////////////////////////////////////////////////////////////////////////
	// const io = require('socket.io')(3000);
	// // Force websocket protocol, otherwise some browsers may try polling.
	// io.set('transports', ['websocket']);
	// // Whenever a new page/client opens a dashboard, we handle the request for the new socket.
	// io.on('connection', function (socket) {
	//     console.log(`Received connection id ${socket.id} connected ${socket.connected}`);

	// 	if( socket.connected )
	// 	{
	// 		//// Broadcast heartbeat event over websockets ever 1 second
	// 		var heartbeatTimer = setInterval( function () 
	// 		{
	// 			socket.emit("heartbeat", servers);
	// 		}, 1000);

	// 		//// If a client disconnects, we will stop sending events for them.
	// 		socket.on('disconnect', function (reason) {
	// 			console.log(`closing connection ${reason}`);
	// 			clearInterval(heartbeatTimer);
	// 		});
	// 	}
	// });

	/////////////////////////////////////////////////////////////////////////////////////////
	// REDIS SUBSCRIPTION
	/////////////////////////////////////////////////////////////////////////////////////////
	let client = redis.createClient(6379, 'localhost', {});
	// We subscribe to all the data being published by the server's metric agent.
	for (var server of servers) {
		// The name of the server is the name of the channel to recent published events on redis.
		client.subscribe(server.name);
	}

	// When an agent has published information to a channel, we will receive notification here.
	client.on("message", function (channel, message) {
		console.log(`Received message from agent: ${channel}`)
		for (var server of servers) {
			// Update our current snapshot for a server's metrics.
			if (server.name == channel) {
				let payload = JSON.parse(message);
				server.txDrop.push(Math.floor(payload.tx_dropped));
				server.cpuLoad.push(Math.floor(payload.cpu));
				server.msgRec = Date.now();
				//server.uptime = payload.uptime;
				postCall(server)
				console.log(server);

			}
		}
	});

	// LATENCY CHECK
	function postCall(server) {

		// Bind a new variable in order to for it to be properly captured inside closure.
		//let captureServer = server;

		// Make request to server we are monitoring.
		got.post(server.url, { json: survey, timeout: 5000, throwHttpErrors: false }).then(function (res) {
			// TASK 2
			//console.log(`${res.statusCode} and ${res.timings.phases.total}`);
			server.statusCodes.push(res.statusCode);
			server.latencies.push(res.timings.phases.total);

			//captureServer.statusCode = res.statusCode;
			//captureServer.latency = res.timings.phases.total;
		}).catch(e => {
			console.log(e);
			server.statusCodes.push(e.code);
			server.latencies.push(5000);

			//captureServer.statusCode = e.code;
			//captureServer.latency = 5000;
		});
	}
}

function score2color(score) {
	if (score <= 0.25) return "#ff0000";
	if (score <= 0.50) return "#ffcc00";
	if (score <= 0.75) return "#00cc00";
	return "#00ff00";
}

setInterval(async function()
    
	{
		if ( servers[0].msgRec != null && servers[1].msgRec != null) {
			let now = Date.now();
			if ( now - servers[1].msgRec >= 5000) {
				var cpuScore = mannwhitneyu.test(servers[0].cpuLoad, servers[1].cpuLoad, alternative = 'two-sided');
				var txScore = mannwhitneyu.test(servers[0].txDrop, servers[1].txDrop, alternative = 'two-sided');
				var statusCodesScore = mannwhitneyu.test(servers[0].statusCodes, servers[1].statusCodes, alternative = 'two-sided');
				var latencyScore = mannwhitneyu.test(servers[0].latencies, servers[1].latencies, alternative = 'two-sided');
				
				let resp = '';
				let effect_size_cpu = (Math.max(cpuScore.U2, cpuScore.U1)) / ((servers[0].cpuLoad.length * servers[1].cpuLoad.length));
				let effect_size_tx = (Math.max(txScore.U2, txScore.U1)) / ((servers[0].txDrop.length * servers[1].txDrop.length));
				let effect_size_status = (Math.max(statusCodesScore.U2, statusCodesScore.U1)) / ((servers[0].statusCodes.length * servers[1].statusCodes.length));
				let effect_size_latency = (Math.max(latencyScore.U2, latencyScore.U1)) / ((servers[0].latencies.length * servers[1].latencies.length));

				resp = `\nCPU Load | p-value: ${cpuScore.p} | effect_size: ${effect_size_cpu}\nTX Dropped | p-value: ${txScore.p} | effect_size: ${effect_size_tx}\nStatus Codes | p-value: ${statusCodesScore.p} | effect_size: ${effect_size_status}\nLatency | p-value: ${latencyScore.p} | effect_size: ${effect_size_latency}\n\n`;

				let failed = [];
				if ( cpuScore.p < .05 ) {
					if ( effect_size_cpu > .80) {
						failed.push("CPU Load");
					}
				}
				if ( txScore.p < .05) {
					if ( effect_size_tx > .80) {
						failed.push("TX Dropped");
					}
				}
				
				if (statusCodesScore.p < .05) {
					if ( effect_size_status > .80) {
						failed.push("Status Codes");
					}
				}
					
				if ( latencyScore.p < .05) {
					if ( effect_size_latency > .80) {
						failed.push("Latency");
					}
				}
				let canary_results = '';

				if ( failed.length == 0) {
					canary_results = "\nThis Canary passed because it passed 4 out of 4 metrics compared to the baseline.\n"
					console.log("This Canary passed because it passed 4 out of 4 metrics compared to the baseline.");
					canary_results += resp;
					console.log(resp);
				} else {
					canary_results =`\nThis Canary failed because it passed ${4 - failed.length} out of 4 metrics compared to the baseline.\n`;
					console.log(`This Canary failed because it passed ${4 - failed.length} out of 4 metrics compared to the baseline.`);
					canary_results += resp;
					console.log(resp);
					canary_results += `These metics failed: ${failed.toString()}\n\n`;
					console.log(`These metics failed: ${failed.toString()}\n`);
				}
				

				//Print results to file??
				fs.writeFileSync('./canary_results.txt', canary_results);
				exit(0);
			}
		}
    }, 3000);

//module.exports.start = start;
start(app);


// var x = [90, 90, 91, 91, 91, 91, 91, 91, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91, 91],
// y = [88, 90, 90, 90, 90, 90, 90, 90, 89, 89, 89, 89, 89, 89, 89, 89, 89, 89, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 93];
// var t = mannwhitneyu.test(x, y, alternative = 'two-sided');

// // //If p < .05 then there is a statistical difference.. p >= .05 means no statistical signifacant difference.
// console.log(t);
// let effect_size = 
// console.log(fin);
// let resp = `test 123\n\
// test 234\n\
// test 345`;
// console.log(resp);