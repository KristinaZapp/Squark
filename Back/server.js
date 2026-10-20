//imports
const WebSocket = require('ws');
const fs = require('fs');
const {DatabaseSync} = require('node:sqlite');

const Creatures = require("./creatures.js");
const Dice = require("./dice.js");
const Lists = require("./lists.js");
const Combat = require("./combat.js");

//global
const players = new Lists.Registry();
const monsters = new Lists.Registry();
const combats = [];

let transitions = null;
let map = null;
let bounds = null;
let positions = null;

let numRooms = 0;
const SPAWN_ROOM = 14; //the room where players spawn
const MOVE_INTERVAL = 30000; //delay between monster moving (30 seconds)
const SPAWN_INTERVAL = 10000; //delay between spawning monsters (10 seconds)
const MAX_MONSTERS = 7; //the maximum number of monsters that can exist

//message constants
const TRANSITIONS = "TRANSITIONS";
const CHARACTER = "CHARACTER";
const BOUNDS = "BOUNDS";
const POSITIONS = "POSITIONS";
const MAP = "MAP";
const PLAYER_ARRIVAL = "PLAYER_ARRIVAL";
const PLAYER_DEPARTURE = "PLAYER_DEPARTURE";
const PLAYER_PRESENT = "PLAYER_PRESENT";
const MONSTER_ARRIVAL = "MONSTER_ARRIVAL";
const MONSTER_DEPARTURE = "MONSTER_DEPARTURE";
const MONSTER_PRESENT = "MONSTER_PRESENT";
const PLAYER_DAMAGED = "PLAYER_DAMAGED";
const MONSTER_DAMAGED = "MONSTER_DAMAGED";
const FLEE_SUCCESSFUL = "FLEE_SUCCESSFUL";
const FLEE_FAILED = "FLEE_FAILED";
const REGISTERED = "REGISTERED";
const REGISTER_FAIL = "REGISTER_FAIL";

const MOVE = "MOVE";
const ATTACK = "ATTACK";
const FLEE = "FLEE";
const LOAD_CHARACTER = "LOAD_CHARACTER";
const NEW_CHARACTER = "NEW_CHARACTER";

//database connection
const db = new DatabaseSync("database.db");

//database prepared statements
//TODO condense these to reuse code
const getPlayers = db.prepare("SELECT * FROM players ORDER BY number");
const getMonsters = db.prepare("SELECT * FROM monsters ORDER BY number");
const addPlayer = db.prepare("INSERT INTO players (number, position, health, maxHealth, attack, speed, defence) VALUES (?, ?, ?, ?, ?, ?, ?)");
const addMonster = db.prepare("INSERT INTO monsters (number, position, health, maxHealth, attack, speed, defence, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const updatePlayer = db.prepare('UPDATE players SET position = ?, health = ? WHERE number = ?');
const updateMonster = db.prepare('UPDATE monsters SET position = ?, health = ? WHERE number = ?');
const deletePlayer = db.prepare("DELETE FROM players WHERE number=?");
const deleteMonster = db.prepare("DELETE FROM monsters WHERE number=?");

//functions to update the database
//these can happen asynchronously since they aren't the primary source of truth
async function updateMonsterDB(monster)
{
	updateMonster.run(monster.position, monster.health, monster.number);
}

async function deleteMonsterDB(monsterNum)
{
	deleteMonster.run(monsterNum);
}

async function addMonsterDB(monster)
{
	addMonster.run(monster.number, monster.position, monster.health, monster.maxHealth, monster.attack, monster.speed, monster.defence, monster.name);
}

async function updatePlayerDB(player)
{
	updatePlayer.run(player.position, player.health, player.number);
}

async function deletePlayerDB(playerNum)
{
	deletePlayer.run(playerNum);
}

async function addPlayerDB(player)
{
	addPlayer.run(player.number, player.position, player.health, player.maxHealth, player.attack, player.speed, player.defence);
}

function startMovingMonster(newMonster)
{
	newMonster.movementIntervalID = setInterval(()=>moveMonster(newMonster), MOVE_INTERVAL);
}

function spawnMonster()
{
	if(monsters.numActive < MAX_MONSTERS)
	{
		//randomly determine the monster type and spawn location
		const monsterType = Dice.randInt(0, Creatures.MonsterTypes.length-1);
		const room = Dice.randInt(0, numRooms-1);

		//create the monster
		let newMonster = new Creatures.MonsterTypes[monsterType](room); //javascript is ridiculous

		console.log("Spawning " + newMonster.name + " in room " + room);

		//add the monster to the list
		monsters.add(newMonster);

		//send messages
		processMonsterMove(newMonster, -2); //I should probably make this a named constant

		//add the monster to the database
		addMonsterDB(newMonster);

		//start moving the monster
		startMovingMonster(newMonster);
	}
}

function moveMonster(monster)
{
	if(!monster.inCombat)
	{
		//update the monster's position based on the transitions table
		const oldPosition = monster.position;
		const newPosition = monster.nextRoom(transitions[monster.position]);

		console.log("moving " + monster.name + " from " + oldPosition + " to " + newPosition);
		monster.position = newPosition;

		//update the database
		updateMonsterDB(monster);

		//notify the players and handle combats
		processMonsterMove(monster, oldPosition);
	}
}

function processMonsterMove(monster, oldPosition)
{
	const newPosition = monster.position;
	const numPlayers = players.length;
	let startedCombat = false;

	//add the monster to the combat in this room, if there is one
	if(combats[newPosition] !== null && combats[newPosition] !== undefined)
	{
		combats[newPosition].addMonster(monster);
	}

	//send messages to the players and start combat if necessary
	for(let i = 0; i < numPlayers; i++)
	{
		const player = players.get(i);
		if(player !== null && player.active)
		{
			if(player.position === oldPosition)
			{
				player.send(MONSTER_DEPARTURE + "$" + monster.toMessage);
			}
			else if(player.position === newPosition)
			{
				player.send(MONSTER_ARRIVAL + "$" + monster.toMessage);

				//start a combat if necessary
				if(combats[newPosition] === null)
				{
					combats[newPosition] = new Combat.Combat(newPosition);
					combats[newPosition].addMonster(monster);
					startedCombat = true;
				}

				if(startedCombat)
				{
					combats[newPosition].addPlayer(player);
				}
			}
		}
	}

	//if we started a combat, start the first turn
	if(startedCombat)
	{
		combats[newPosition].firstTurn();
	}
}

function checkForMonsters(player)
{
	const room = player.position;
	const numMonsters = monsters.length;
	let combatStarted = false;

	//add the player to the combat in this room, if there is one
	if(combats[room] !== null)
	{
		combats[room].addPlayer(player);
	}

	for(let i=0; i < numMonsters; i++)
	{
		const monster = monsters.get(i);
		if(monster !== null)
		{
			if(monster.position === room)
			{
				player.send(MONSTER_PRESENT + "$" + monster.toMessage);

				//start combat if necessary
				if(combats[room] === null)
				{
					combats[room] = new Combat.Combat(room);
					combats[room].addPlayer(player);
					combatStarted = true;
				}

				//if we started combat, add this monster to it
				if(combatStarted)
				{
					combats[room].addMonster(monster);
				}
			}
		}
	}

	//if we started combat, start the first turn
	if(combatStarted)
	{
		combats[room].firstTurn();
	}
}

function handleMessage(msg, socket)
{
	const parts = msg.toString().split("$");
	const playerNum = parseInt(parts[0])
	if(parts[1] === MOVE)
	{
		//update the player's position
		const player = players.get(playerNum);
		const position = parseInt(parts[2]);
		const oldPosition = player.position;
		player.position = position;
		updatePlayerDB(player);
		// console.log("player " + playerNum + " is now in position " + player.position);

		//update the other players
		sendPlayerMove(playerNum, oldPosition, position);

		//check if there are any monsters in the new room
		checkForMonsters(player);
	}
	else if(parts[1] === ATTACK)
	{
		const monsterNum = parseInt(parts[2]);
		const dmg = Dice.d6() + players.get(playerNum).attack;
		damageMonster(monsterNum, dmg, playerNum);
		combats[players.get(playerNum).position].playerActed(playerNum);
	}
	else if(parts[1] === FLEE)
	{
		const player = players.get(playerNum);
		let msg = null;

		//check if the player flees successfully
		if(combats[player.position].fleeSuccessful(player))
		{
			msg = FLEE_SUCCESSFUL;
		}
		else
		{
			msg = FLEE_FAILED;
		}

		//send the messages to everyone in the room
		const numPlayers = players.length;
		for(let i=0; i < numPlayers; i++)
		{
			const p = players.get(i);
			if(p !== null && p.position === player.position)
			{
				p.send(msg + "$" + playerNum);
			}
		}
	}
	else if(parts[1] === NEW_CHARACTER)
	{
		newCharacter(socket);
	}
	else if(parts[1] === LOAD_CHARACTER)
	{
		const player = players.get(parseInt(parts[2]));
		if(player !== undefined && player !== null && (parseInt(parts[3]) === player.position || (parseInt(parts[3]) === SPAWN_ROOM && player.position===-1)) && parseInt(parts[4]) === player.health && parseInt(parts[5]) === player.maxHealth && parseInt(parts[6]) === player.attack && parseInt(parts[7]) === player.speed && parseInt([parts[8]]) === player.defence)
		{
			player.socket = socket;
			player.activate();
			socket.send(REGISTERED);
		}
		else
		{
			socket.send(REGISTER_FAIL);
		}
	}
	else
	{
		console.log(msg.toString());
	}
}

function sendPlayerMove(playerNum, oldPosition, newPosition)
{
	for(let i=0; i < players.length; i++)
	{
		if(i != playerNum)
		{
			const player = players.get(i);
			if(player !== null && player.active)
			{
				//if the player is in the new room
				if(player.position === newPosition)
				{
					player.send(PLAYER_ARRIVAL + "$" + players.get(playerNum).toMessage);
					players.get(playerNum).send(PLAYER_PRESENT + "$" + player.toMessage);
				}

				//if the player is in the old room
				else if(player.position === oldPosition)
				{
					player.send(PLAYER_DEPARTURE + "$" + playerNum);
				}
			}
		}
	}
}

function initializeWebSocket()
{
	const wss = new WebSocket.Server({port:6767});
	wss.on("connection", newClient);
}

function newClient(socket)
{
	socket.on("message", (msg)=>handleMessage(msg, socket));
	socket.on("close", ()=>players.deactivateBySocket(socket));

	//send the map data to the client
	socket.send(TRANSITIONS + "$" + JSON.stringify(transitions));
	socket.send(MAP + "$" + map);
	socket.send(BOUNDS + "$" + bounds);
	socket.send(POSITIONS + "$" + positions);
}

function newCharacter(socket)
{
	//create the character object
	const newCharacter = new Creatures.Character(socket, -1);
	players.add(newCharacter);
	addPlayerDB(newCharacter);

	//send the character data to the client
	socket.send(CHARACTER + "$" + newCharacter.health + "," + newCharacter.attack + "," + newCharacter.speed + "," + newCharacter.defence + "," + SPAWN_ROOM + "," + newCharacter.number);

	console.log("character " + newCharacter.number + " created");
}

function combatOver(room)
{
	combats[room] = null;
}

function damagePlayer(playerNum, dmg, damagedBy)
{
	const player = players.get(playerNum);
	dealDamage(PLAYER_DAMAGED, player, dmg, damagedBy);

	if(player.health === 0)
	{
		deletePlayerDB(playerNum);
		players.clear(playerNum);
	}
	else
	{
		updatePlayerDB(player);
	}
}

function damageMonster(monsterNum, dmg, damagedBy)
{
	//deal the damage
	const monster = monsters.get(monsterNum);
	dealDamage(MONSTER_DAMAGED, monster, dmg, damagedBy);

	//update the database
	if(monster.health === 0)
	{
		deleteMonsterDB(monsterNum); //remove it if it's dead
		monsters.clear(monsterNum); //remove from the in-memory registry too
	}
	else
	{
		updateMonsterDB(monster);
	}
}

function dealDamage(msgString, creature, dmg, damagedBy)
{
	//deal the damage
	const effectiveDMG = Math.max(dmg - creature.defence, 0);
	creature.damage(effectiveDMG);

	//send to all the players in the same room
	const numPlayers = players.length;
	for(let i=0; i < numPlayers; i++)
	{
		const p = players.get(i);
		if(p !== null && p.active && p.position === creature.position)
		{
			p.send(msgString + "$" + creature.number + "$" + effectiveDMG + "$" + damagedBy);
		}
	}
}

function playerGone(player)
{
	//remove the player from combat if necessary
	if(combats[player.position] !== null && combats[player.position] !== undefined)
	{
		combats[player.position].removePlayer(player);
	}

	//update the other players
	sendPlayerMove(player.number, player.position, -1);
}

function loadMonsters()
{
	const arr = getMonsters.all();
	for(const m of arr)
	{
		console.log("loading " + m.name + " in position " + m.position);

		//find the right type of monster
		for(const C of Creatures.MonsterTypes)
		{
			//if it's the right type
			if(m.name.replace(/\s+/g, "") === C.name)
			{
				//create the monster
				const newMonster = new C(m.position, m.maxHealth, m.attack, m.speed, m.defence);

				//update the health
				const dmg = m.maxHealth - m.health;
				newMonster.damage(dmg);

				//set the number
				newMonster.number = m.number;

				//start moving the monster
				startMovingMonster(newMonster);

				//add the monster to the in-memory registry
				monsters.add(newMonster);
			}
		}
	}
}

function loadPlayers()
{
	const arr = getPlayers.all();
	for(const c of arr)
	{
		console.log("Loading character " + c.number + " in position " + c.position);

		//create the character
		const newPlayer = new Creatures.Character(null, c.position, c.maxHealth, c.attack, c.speed, c.defence);

		//update the health
		const dmg = c.maxHealth - c.health;
		newPlayer.damage(dmg);

		//set the number
		newPlayer.number = c.number;

		//add the player to the in-memory registry
		players.add(newPlayer);
	}
}

function main()
{
	//read the map data
	transitionsString = fs.readFileSync("transitions.json", "utf-8");
	transitions = JSON.parse(transitionsString); //I wrote it in JSON by hand because I'm a masochist
	map = fs.readFileSync("map.txt", "utf-8");
	bounds = fs.readFileSync("bounds.txt", "utf-8");
	positions = fs.readFileSync("positions.txt", "utf-8");

	numRooms = bounds.split("\n").length-1;

	//I guess not necessary but it makes the code a little easier
	for(let i=0; i < numRooms; i++)
	{
		combats.push(null);
	}

	//load the players from the database
	loadPlayers();

	//load the monsters from the database
	loadMonsters();

	//spawn one monster to start
	spawnMonster();

	//spawn more monsters
	setInterval(()=>{spawnMonster()}, SPAWN_INTERVAL);

	//listen for clients
	initializeWebSocket();
}

//the actual program
main();

//exports
exports.damagePlayer = damagePlayer;
exports.combatOver = combatOver;
exports.playerGone = playerGone;