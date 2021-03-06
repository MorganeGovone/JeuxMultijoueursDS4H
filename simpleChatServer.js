const express = require('express')
const app = express();
const http = require('http').Server(app);

const io = require('socket.io')(http);
let interval;

http.listen(8082, () => {
	console.log("Web server écoute sur http://localhost:8082");
})

// Indicate where static files are located. Without this, no external js file, no css...  
app.use(express.static(__dirname + '/public'));    


// routing
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// nom des joueurs connectés sur le chat
var playerNames = {};
var listOfPlayers = {};



io.on('connection', (socket) => {
	let emitStamp;
	let connectionStamp = Date.now();
	let nbUpdatesPerSeconds=2;

	function heartbeat() {
		//  Michel Buffa : attention si tu fais ça ça ne changera jamais....
		//nbUpdatesPerSeconds = 2;
		// ici typiquement : 
		// 1) gérer les messages reçus relatifs aux déplacements des joueurs
		// 2) déplacer les joueurs
		// ...éventuellement gérer une file des messages en attente au lieu de 1 seul message (réconciliation)
		// déplacer les obsctacles, gérer les collisions etc.
		socket.emit("heartbeat");
}

	// Pour le ping/pong mesure de latence
	setInterval(() => {
        emitStamp = Date.now();
        socket.emit("ping");
    },500);

	socket.on("pongo", () => { // "pong" is a reserved event name
		let currentTime = Date.now();
		let timeElapsedSincePing = currentTime - emitStamp;
		let serverTimeElapsedSinceClientConnected = currentTime - connectionStamp;

		//console.log("pongo received, rtt time = " + timeElapsedSincePing);

		socket.emit("data", currentTime, timeElapsedSincePing, serverTimeElapsedSinceClientConnected);
	});

	//Heartbeat
	// Michel Buffa : on garde un id sur ce setInterval pour pouvoir éventuellement l'arrêter
	// ou le relancer avec un nouvel intervalle
	interval = setInterval(heartbeat, 1000/nbUpdatesPerSeconds);

	socket.on("heart", ()=> {
		//console.log("heartbeat of:" + nbUpdatesPerSeconds + "per seconds");
		socket.emit("hearbeat", nbUpdatesPerSeconds);
	});

	// when the client emits 'sendchat', this listens and executes
	socket.on('sendchat', (data) => {
		// we tell the client to execute 'updatechat' with 2 parameters
		io.sockets.emit('updatechat', socket.username, data);
	});

	// when the client emits 'sendchat', this listens and executes
	socket.on('sendpos', (newPos) => {
		// we tell the client to execute 'updatepos' with 2 parameters
		//console.log("recu sendPos");
		socket.broadcast.emit('updatepos', socket.username, newPos);
	});

	// Michel Buffa : on rentre dans cet écouteur quand un client a envoyé un message
	// demandant au serveur de modifier sa fréquence d'updates
	// Tu avais oublié le paramètre avec la nouvelle valeur !
	socket.on("updates",(data)=>{
		// Michel Buffa : ici on arrête le setInterval qui appelle la méthode heartbeat et on le
		// relance avec le nouveau delay
		nbUpdatesPerSeconds = data;
		// on arrête le setInterval
    	clearInterval(interval);
		// on le relance avec la nouvelle fréquence
    	interval = setInterval(heartbeat, 1000 / nbUpdatesPerSeconds);

		// on prévient les autres clients que la fréquence du serveur a changé
		// ils devront écouter cet événement pour repositionner leur slider et affichage
    	io.emit("updates", nbUpdatesPerSeconds);

		socket.broadcast.emit('updatenb',nbUpdatesPerSeconds);
	})

	// when the client emits 'adduser', this listens and executes
	socket.on('adduser', (username) => {
		// we store the username in the socket session for this client
		// the 'socket' variable is unique for each client connected,
		// so we can use it as a sort of HTTP session
		socket.username = username;
		// add the client's username to the global list
		// similar to usernames.michel = 'michel', usernames.toto = 'toto'
		playerNames[username] = username;
		// echo to the current client that he is connected
		socket.emit('updatechat', 'SERVER', 'you have connected');
		// echo to all client except current, that a new person has connected
		socket.broadcast.emit('updatechat', 'SERVER', username + ' has connected');
		// tell all clients to update the list of users on the GUI
		io.emit('updateusers', playerNames);

		// Create a new player and store his position too... for that
		// we have an object that is a "list of players" in that form
		// listOfPlayer = {'michel':{'x':0, 'y':0, 'v':0}, 
		// 							john:{'x':10, 'y':10, 'v':0}}
		// for this example we have x, y and v for speed... ?
		var player = {x:10, y:10, vx:0, vy:0,color:'red', updatesPerSeconds : nbUpdatesPerSeconds};
		listOfPlayers[username] = player;
		io.emit('updatePlayers',listOfPlayers);
		io.emit('updateNb',listOfPlayers[username].updatesPerSeconds);
	});

	// when the user disconnects.. perform this
	socket.on('disconnect', () => {
		// remove the username from global usernames list
		delete playerNames[socket.username];
				// update list of users in chat, client-side
		io.emit('updateusers', playerNames);

		// Remove the player too
		delete listOfPlayers[socket.username];		
		io.emit('updatePlayers',listOfPlayers);
		
		// echo globally that this client has left
		socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
	});
});