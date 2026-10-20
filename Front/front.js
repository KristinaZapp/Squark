//------------------------------------------------
//Functions
//------------------------------------------------

//alert functions
function addAlert(txt)
{
	const newAlert = `<div id = "alert` + nextAlert + `" class="alert">` + txt + `</div><br>`;
	alerts.innerHTML = newAlert + alerts.innerHTML;
	setTimeout(fadeoutAlert, ALERT_LIFETIME, "alert" + nextAlert);
	nextAlert++;
}

function fadeoutAlert(alertID)
{
	$("#" + alertID).fadeOut(callback=()=>removeAlert(alertID)); //there ought to be a better way to do this
}

function removeAlert(alertID)
{
	document.getElementById(alertID).remove();
}

//check if there is any save data
function checkForCharacter()
{
	if(localStorage.getItem("playerNumber") === null)
	{
		sendMessage(NEW_CHARACTER);
	}
	else
	{
		startButton.hidden = true;
		loadCharacterButton.hidden = false;
		newCharacterButton.hidden = false;
		gameText.innerHTML = "Saved character data detected. Would you like to load this character or start a new character?";
	}
}

//start the game
function startGame()
{
	startButton.hidden = true;
	loadCharacterButton.hidden = true;
	newCharacterButton.hidden = true;
	if(readyToPlay())
	{
		startState = StartStates.STARTED;
		processMove();
		updateCharacterStatus();
		canvas.hidden = false;
		map.hidden = false;
	}
	else
	{
		startState = StartStates.WAITING;
		gameText.innerHTML = "Waiting for server";
	}
}

function newCharacter()
{
	//TODO delete the old character
	sendMessage(NEW_CHARACTER);
	startGame();
}

function loadCharacter()
{
	sendMessage(LOAD_CHARACTER + "$" + localStorage.getItem("playerNumber") + "$" + localStorage.getItem("position") + "$" + localStorage.getItem("health") + "$" + localStorage.getItem("maxHealth") + "$" + localStorage.getItem("attack") + "$" + localStorage.getItem("speed") + "$" + localStorage.getItem("defence"));
}

function tryToConnect()
{
	console.log("trying to connect");
	let timeoutID = setTimeout(tryToConnect, 5000); //too fast of a timeout?
	socket = new WebSocket("ws://localhost:6767"); //need to use the actual url on a production build
	socket.addEventListener("message", handleMessage);
	socket.addEventListener("open", () => {console.log("server connected");clearTimeout(timeoutID);checkForCharacter()});
	socket.addEventListener("close", () => {console.log("server disconnected");tryToConnect()});
}

function resetCharacterStats()
{
	position = -1;
	health = -1;
	maxHealth = -1;
	attack = -1;
	speed = -1;
	defence = -1;
	playerNumber = -1;
}

function resetPlayerMap()
{
	playerMap = [];

	for(let line of fullMapLines)
	{
		let str = "";
		for(let i=0; i < line.length; i++)
		{
			str += " ";
		}
		playerMap.push(str);
	}
}

function resetExplored()
{
	explored = [];
	for(let i=0; i < positions.length; i++)
	{
		explored.push(false);
	}

}

//constructors for players and monsters
function Player(num, health, maxHealth)
{
	this.number = num;
	this.health = health;
	this.maxHealth = maxHealth;
}

function Monster(num, health, maxHealth, name)
{
	this.number = num;
	this.health = health;
	this.maxHealth = maxHealth;
	this.name = name;
}

//message handler
function handleMessage(msg)
{
	const parts = msg.data.split("$");
	if(parts[0] === CHARACTER)
	{
		const stats = parts[1].split(",");
		maxHealth = parseInt(stats[0]);
		health = maxHealth;
		attack = parseInt(stats[1]);
		speed = parseInt(stats[2]);
		defence = parseInt(stats[3]);
		position = parseInt(stats[4]);
		playerNumber = parseInt(stats[5]);

		localStorage.setItem("maxHealth", maxHealth);
		localStorage.setItem("health", health);
		localStorage.setItem("attack", attack);
		localStorage.setItem("speed", speed);
		localStorage.setItem("defence", defence);
		localStorage.setItem("position", position);
		localStorage.setItem("playerNumber", playerNumber);
		localStorage.setItem("positionsExplored", "");

		if(startState === StartStates.WAITING) startGame();
	}
	else if(parts[0] === TRANSITIONS)
	{
		transitions = JSON.parse(parts[1]);
		if(startState === StartStates.WAITING) startGame();
	}
	else if(parts[0] === MAP)
	{
		fullMapLines = parts[1].split("\n");
		resetPlayerMap();
		if(startState === StartStates.WAITING) startGame();
	}
	else if(parts[0] === BOUNDS)
	{
		bounds = [];
		let lines = parts[1].split("\n");
		for(let line of lines)
		{
			//hack but probably fine
			if(line.length > 0)
			{
				let coords = line.split(" ");
				let coords1 = coords[0].split("-");
				let coords2 = coords[1].split("-");
				let localBounds = [[parseInt(coords1[0]), parseInt(coords1[1])], [parseInt(coords2[0]), parseInt(coords2[1])]]; //this might be the worst code I've ever written
				bounds.push(localBounds);
			}
		}

		if(startState === StartStates.WAITING) startGame();
	}
	else if(parts[0] === POSITIONS)
	{
		positions = [];
		let lines = parts[1].split("\n");
		for(let line of lines)
		{
			let coords = line.split(",");
			let point = [parseInt(coords[0]), parseInt(coords[1])];
			positions.push(point);
		}

		//I guess doing this here is fine?
		resetExplored();

		if(startState === StartStates.WAITING) startGame();
	}
	else if(parts[0] === PLAYER_ARRIVAL)
	{
		addAlert("An adventurer has entered the room");
		const stats = parts[1].split(",");
		const newPlayer = new Player(parseInt(stats[0]), parseInt(stats[1]), parseInt(stats[2]));
		playersPresent.push(newPlayer);
		updatePlayerList();
	}
	else if(parts[0] === PLAYER_DEPARTURE)
	{
		addAlert("An adventurer has left the room");
		playersPresent = playersPresent.filter((player)=>player.number !== parseInt(parts[1]))
		updatePlayerList();
	}
	else if(parts[0] === PLAYER_PRESENT)
	{
		addAlert("An adventurer is in the room");
		const stats = parts[1].split(",");
		const newPlayer = new Player(parseInt(stats[0]), parseInt(stats[1]), parseInt(stats[2]));
		playersPresent.push(newPlayer);
		updatePlayerList();
	}
	else if(parts[0] === MONSTER_ARRIVAL)
	{
		const stats = parts[1].split(",");
		const newMonster = new Monster(parseInt(stats[0]), parseInt(stats[1]), parseInt(stats[2]), stats[3])
		addAlert("A " + newMonster.name + " has entered the room. It attacks you!");
		monstersPresent.push(newMonster);
		updateMonsterList();
		hideArrows();
	}
	else if(parts[0] === MONSTER_DEPARTURE)
	{
		const num = parseInt(parts[1]);
		const monster = getByNumber(monstersPresent, num);
		addAlert("A " + monster.name + " has left the room");
		monstersPresent = monstersPresent.filter((monster)=>monster.number !== num);
		updateMonsterList();
	}
	else if(parts[0] === MONSTER_PRESENT)
	{
		const stats = parts[1].split(",");
		const newMonster = new Monster(parseInt(stats[0]), parseInt(stats[1]), parseInt(stats[2]), stats[3])
		addAlert("A " + newMonster.name + " is in the room. It attacks you!");
		monstersPresent.push(newMonster);
		updateMonsterList();
		hideArrows();
	}
	else if(parts[0] === TURN)
	{
		addAlert("Your turn! Times out in 30s"); //hard-coded time limit but it's probably fine
		attackButton.hidden = false;
		fleeButton.hidden = false;
	}
	else if(parts[0] === PLAYER_DAMAGED)
	{
		const playerNum = parseInt(parts[1]);
		const dmg = parseInt(parts[2]);
		const damagedBy = parseInt(parts[3]);
		const monster = getByNumber(monstersPresent, damagedBy);

		let alertText = monster.name + " dealt " + dmg + " points of damage to ";

		//if we were damaged
		if(playerNum === playerNumber) //TODO fix these variable names
		{
			health = Math.max(0, health - dmg); //udpate the value
			localStorage.setItem("health", health); //update the value in local storage
			updateCharacterStatus();
			alertText += "you";
			if(health === 0)
			{
				alertText += ", killing you";
				gameText.innerHTML = "You have been killed. Would you like to play again with a new character?";
				localStorage.clear();
				resetPlayerMap();
				resetCharacterStats();
				resetExplored();
				newCharacterButton.hidden = false;
				attackButton.hidden = true;
				fleeButton.hidden = true;
			}
		}

		//if it was someone else
		else
		{
			alertText += "another adventurer";
			const player = getByNumber(playersPresent, playerNum);
			player.health = Math.max(0, player.health - dmg);
			if(player.health === 0)
			{
				alertText += ", killing them";
				playersPresent = playersPresent.filter((x)=>x.health > 0);
			}
			updatePlayerList();
		}

		addAlert(alertText);
	}
	else if(parts[0] === MONSTER_DAMAGED)
	{
		const monsterNum = parseInt(parts[1]);
		const dmg = parseInt(parts[2]);
		const damagedBy = parseInt(parts[3]);
		const monster = getByNumber(monstersPresent, monsterNum);
		monster.health = Math.max(monster.health - dmg, 0);

		let alertText = "";
		if(damagedBy === playerNumber)
		{
			alertText += "You dealt ";
		}
		else
		{
			alertText += "Another adventurer dealt ";
		}

		alertText += dmg + " points of damage to " + monster.name;

		if(monster.health === 0)
		{
			alertText += ", killing it!";
			monstersPresent = monstersPresent.filter((x)=>x.health > 0);

			//if that was the last monster, combat is over
			if(monstersPresent.length === 0)
			{
				exitCombat();
			}
		}

		addAlert(alertText);
		updateMonsterList();
	}
	else if(parts[0] === FLEE_SUCCESSFUL)
	{
		const playerNum = parseInt(parts[1]);
		let alertText = "";

		if(playerNum === playerNumber)
		{
			alertText += "You successfully ";
			exitCombat();
		}
		else
		{
			alertText += "Another adventurer ";
		}

		alertText += "fled from combat";
		addAlert(alertText);
	}
	else if(parts[0] === FLEE_FAILED)
	{
		const playerNum = parseInt(parts[1]);
		let alertText = "";

		if(playerNum === playerNumber)
		{
			alertText += "You ";
		}
		else
		{
			alertText += "Another adventurer tried and "
		}

		alertText += "failed to flee from combat";
		addAlert(alertText);
	}
	else if(parts[0] === REGISTERED)
	{
		//load our saved information
		playerNumber = parseInt(localStorage.getItem("playerNumber"));
		position = parseInt(localStorage.getItem("position"));
		health = parseInt(localStorage.getItem("health"));
		maxHealth = parseInt(localStorage.getItem("maxHealth"));
		attack = parseInt(localStorage.getItem("attack"));
		speed = parseInt(localStorage.getItem("speed"));
		defence = parseInt(localStorage.getItem("defence"));
		const positionsExplored = localStorage.getItem("positionsExplored");
		const tokens = positionsExplored.split(",");

		//remember which parts of the map we have already seen
		//TODO does this break if we aren't ready to play yet? Maybe this needs to wait
		for(const token of tokens)
		{
			if(token.length > 0)
			{
				revealRoom(parseInt(token));
			}
		}

		//start the game
		startGame();
	}
	else if(parts[0] === REGISTER_FAIL)
	{
		gameText.innerHTML = "Failed to authenticate player information. Would you like to start a new character?"
		loadCharacterButton.hidden = true;
	}
	else
	{
		console.log(msg.data);
	}
}

//functions for updating html
function updateCharacterStatus()
{
	charStatus.innerHTML = "HP: " + health + "/" + maxHealth + "    ATK: " + attack + "    DEF: " + defence + "    SPD: " + speed; 
}

function updatePlayerList()
{
	let html = "";
	for(let player of playersPresent)
	{
		html += "<li>Adventurer HP: " + player.health + "/" + player.maxHealth + "</li>";
	}
	playerList.innerHTML = html;
}

function updateMonsterList()
{
	//update the list of monsters
	let html = "";
	for(let monster of monstersPresent)
	{
		html += "<li>" + monster.name + " HP: " + monster.health + "/" + monster.maxHealth + "</li>";
	}
	monsterList.innerHTML = html;

	//update monster images
	ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight); //clear the canvas

	const offset = canvas.offsetWidth / (monstersPresent.length+1);
	const imgSize = canvas.offsetHeight / 2;
	const heightOffset = canvas.offsetHeight / 4;
	for(let i=0; i < monstersPresent.length; i++)
	{
		const monster = monstersPresent[i];
		ctx.drawImage(monsterImages[monsterTypes.indexOf(monster.name)], (i+1) * offset, heightOffset, imgSize, imgSize);
	}
}

function revealRoom(room)
{
	for(let i = bounds[room][0][0]; i <= bounds[room][0][1]; i++)
	{
		playerMap[i] = playerMap[i].substring(0, bounds[room][1][0]) + fullMapLines[i].substring(bounds[room][1][0], bounds[room][1][1]+1) + playerMap[i].substring(bounds[room][1][1]+1);
	}
	explored[room] = true;
}

function updateMap()
{
	mapStr = "";

	for(let i=0; i < playerMap.length; i++)
	{
		if(i == positions[position][0])
		{
			mapStr += playerMap[i].substring(0, positions[position][1]) + "@" + playerMap[i].substring(positions[position][1] + 1, playerMap[i].length) + "\n";
		}
		else
		{
			mapStr += playerMap[i] + "\n";
		}
	}

	map.innerText = mapStr;
}

function hideArrows()
{
	upArrow.hidden = true;
	downArrow.hidden = true;
	leftArrow.hidden = true;
	rightArrow.hidden = true;
}

function updateArrows()
{
	for(let direction of directions)
	{
		if(transitions[position][direction] !== undefined)
		{
			arrows[direction].hidden = false;
		}
		else
		{
			arrows[direction].hidden = true;
		}
	}
}

function generateTargetList()
{
	//generate the html
	let html = "";
	let monsterNums = [];
	for(let monster of monstersPresent)
	{
		let buttonID = "target" + monster.number;
		html += `<li><button id="` + buttonID + `" class="generic_button">` + monster.name + `</button></li>`;
		monsterNums.push(monster.number);
	}

	//set the html
	targetButtons.innerHTML = html;

	//set the event listeners
	for(let num of monsterNums)
	{
		document.getElementById("target"+num).addEventListener("click", ()=>handleTarget(num));
	}
}

function exitCombat()
{
	attackButton.hidden = true;
	fleeButton.hidden = true;
	updateArrows();
}

//functions for processing input
function processMove()
{
	if(!explored[position])
	{
		revealRoom(position);
		localStorage.setItem("positionsExplored", localStorage.getItem("positionsExplored") + position + ","); //I guess this is fine
	}

	updateMap();
	updateArrows();
	localStorage.setItem("position", position);

	//TODO reactivate descriptions
	gameText.innerHTML = "";
	
	alerts.innerHTML = ""; //maybe fade this out or something?
	playersPresent = [];
	monstersPresent = [];
	updateMonsterList();
	updatePlayerList();
	sendMove();
}

function handleTarget(monsterNum)
{
	targetButtons.innerHTML = "";
	attackButton.hidden = true;
	fleeButton.hidden = true;
	sendAttack(monsterNum);
}

//message sending functions
function sendMessage(msg)
{
	const modMessage = playerNumber + "$" + msg;
	socket.send(modMessage);
}

function sendMove()
{
	sendMessage(MOVE_MSG + "$" + position);
}

function sendAttack(target)
{
	sendMessage(ATTACK + "$" + target);
}

function sendFlee()
{
	sendMessage(FLEE);
}

//helper functions
function readyToPlay()
{
	return position != -1 && fullMapLines != null && positions != null && bounds != null && transitions != null && imgsLoaded === monsterTypes.length;
}

function getByNumber(arr, num)
{
	return arr.filter((x)=>x.number === num)[0];
}

//------------------------------------------------
//Main program
//------------------------------------------------

const StartStates = Object.freeze({INITIAL:0, WAITING:1, STARTED:2}); //the lack of enums kills me
let startState = StartStates.INITIAL;

//get the elements of the page
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const gameText = document.getElementById("game_text");
const charStatus = document.getElementById("character_status");
const map = document.getElementById("map");
const inputZone = document.getElementById("input_zone");
const alerts = document.getElementById("alerts");

const startButton = document.getElementById("start_button");
startButton.addEventListener("click", ()=>{startGame()});

const newCharacterButton = document.getElementById("new_character");
newCharacterButton.addEventListener("click", newCharacter);

const loadCharacterButton = document.getElementById("load_character");
loadCharacterButton.addEventListener("click", loadCharacter);

const arrowZone = document.getElementById("arrow_zone");
const leftArrow = document.getElementById("left_arrow");
const rightArrow = document.getElementById("right_arrow");
const upArrow = document.getElementById("up_arrow");
const downArrow = document.getElementById("down_arrow");

const playerList = document.getElementById("player_list");
const monsterList = document.getElementById("monster_list");

const attackButton = document.getElementById("attack_button");
attackButton.addEventListener("click", generateTargetList);

const fleeButton = document.getElementById("flee_button");
fleeButton.addEventListener("click", sendFlee);

const targetButtons = document.getElementById("target_buttons");

//this is so ugly
leftArrow.addEventListener("click", () => {position = transitions[position].left;processMove()});
rightArrow.addEventListener("click", () => {position = transitions[position].right;processMove()});
upArrow.addEventListener("click", () => {position = transitions[position].up;processMove()});
downArrow.addEventListener("click", () => {position = transitions[position].down;processMove()});

const arrows = {up : upArrow, down : downArrow, left : leftArrow, right : rightArrow};
const directions = ["up", "down", "left", "right"];

//initialize socket
let socket = null;
tryToConnect();

//initialize map data
let fullMapLines = null;
let positions = null;
let bounds = null;
let transitions = null;
let playerMap = null;
let explored = null;

//initialize the lists of who is present
let playersPresent = [];
let monstersPresent = [];

//initialize character data
let position = -1;
let health = -1;
let maxHealth = -1;
let attack = -1;
let speed = -1;
let defence = -1;
let playerNumber = -1;

//message constants
const CHARACTER = "CHARACTER";
const TRANSITIONS = "TRANSITIONS";
const BOUNDS = "BOUNDS";
const POSITIONS = "POSITIONS";
const MAP = "MAP";
const PLAYER_ARRIVAL = "PLAYER_ARRIVAL";
const PLAYER_DEPARTURE = "PLAYER_DEPARTURE";
const PLAYER_PRESENT = "PLAYER_PRESENT";
const MONSTER_ARRIVAL = "MONSTER_ARRIVAL";
const MONSTER_DEPARTURE = "MONSTER_DEPARTURE";
const MONSTER_PRESENT = "MONSTER_PRESENT";
const TURN = "TURN";
const PLAYER_DAMAGED = "PLAYER_DAMAGED";
const MONSTER_DAMAGED = "MONSTER_DAMAGED";
const FLEE_SUCCESSFUL = "FLEE_SUCCESSFUL";
const FLEE_FAILED = "FLEE_FAILED";
const REGISTERED = "REGISTERED";
const REGISTER_FAIL = "REGISTER_FAIL";

const MOVE_MSG = "MOVE";
const ATTACK = "ATTACK";
const FLEE = "FLEE";
const LOAD_CHARACTER = "LOAD_CHARACTER";
const NEW_CHARACTER = "NEW_CHARACTER";

//alert variables
let nextAlert = 0;
const ALERT_LIFETIME = 5000; //10 seconds

//load images
let imgsLoaded = 0;
const monsterTypes = ["Angel", "Clown Beetle", "Crystal Ball", "Kiwwwi", "Mask Bat", "Maybe Deer", "No Eyes", "Seeing Plant", "Seraphim", "Shade", "Temple Keeper", "Temple Security"];
const monsterImages = [];

for(const monsterType of monsterTypes)
{
	const newImage = new Image();
	newImage.src = "imgs/" + monsterType + ".png";
	newImage.addEventListener("load", ()=>{imgsLoaded++;if(startState === StartStates.WAITING)startGame();}); //functional programming is fun
	monsterImages.push(newImage);
}