//imports
const Dice = require("./dice.js");
const Server = require("./server.js");

//message constants
const TURN = "TURN";

//helper functions
function speedScore(arr)
{
	const scores = arr.map((p)=>Dice.d6()+p.speed).sort((a,b)=>(a-b));
	const index = Math.floor(scores.length/2);
	const median =scores[index];
	return median;
}

function indexOfNumber(arr, num)
{
	for(let i=0; i < arr.length; i++)
	{
		if(arr[i].number === num)
			return i;
	}
	return -1;
}

//combat class
class Combat
{
	#players;
	#monsters;
	#playersActed;
	#position;

	#playerTurnTimeoutID;

	constructor(position)
	{
		this.#players = [];
		this.#monsters = [];
		this.#position = position;
	}

	addPlayer(newPlayer)
	{
		this.#players.push(newPlayer);
	}

	addMonster(newMonster)
	{
		this.#monsters.push(newMonster);
		newMonster.inCombat = true;
	}

	firstTurn()
	{
		const playerScore = speedScore(this.#players);
		const monsterScore = speedScore(this.#monsters);

		if(playerScore >= monsterScore)
		{
			this.playerTurn();
		}
		else
		{
			this.monsterTurn();
		}
	}

	playerTurn()
	{
		//remove all the players that are dead
		this.#players = this.#players.filter((x)=>x.health > 0);

		//if there are still players, they can move
		if(this.#players.length > 0)
		{
			//reset the players acted tracker
			this.#playersActed = [];

			//each player can act
			for(const player of this.#players)
			{
				this.#playersActed.push(false);
				player.send(TURN);
			}

			this.#playerTurnTimeoutID = setTimeout(this.monsterTurn.bind(this), 30000);
		}

		//otherwise, the monsters win
		else
		{
			this.monsterWin();
		}
	}

	monsterTurn()
	{
		//remove all the monsters that are dead
		this.#monsters = this.#monsters.filter((x)=>x.health > 0);

		if(this.#monsters.length > 0)
		{
			//each monster takes an attack
			for(const monster of this.#monsters)
			{
				if(this.#players.length > 0)
				{
					const target = monster.target(this.#players);
					const dmg = Dice.d6() + monster.attack;
					Server.damagePlayer(target, dmg, monster.number);
					this.#players = this.#players.filter((x)=>x.health > 0);
				}
			}

			//the players can act
			this.playerTurn();
		}
		else
		{
			Server.combatOver(this.#position);
		}
	}

	//mark that a player acted
	playerActed(num)
	{
		this.#playersActed[indexOfNumber(this.#players,num)] = true;
		this.checkForMonsterTurn();
	}

	//check if the monsters can move
	checkForMonsterTurn()
	{
		//if there are no more players, the monsters win
		if(this.#players.length === 0)
		{
			clearTimeout(this.#playerTurnTimeoutID);
			this.monsterWin();
		}
		else if(this.#playersActed.filter((x)=>!x).length === 0)
		{
			clearTimeout(this.#playerTurnTimeoutID);
			this.monsterTurn();
		}
	}

	fleeSuccessful(player)
	{
		let res = false;

		this.#playersActed[indexOfNumber(this.#players,player.number)] = true;

		//roll the speed checks
		const playerScore = Dice.d6() + player.speed;
		const monsterScore = speedScore(this.#monsters);

		//if the player succesfully got away
		if(playerScore >= monsterScore)
		{
			//remove the player from the combat
			this.#players = this.#players.filter((x)=>x!==player);
			res = true;
		}

		if(this.#players.length > 0)
			this.checkForMonsterTurn();
		else
			this.monsterWin();
		
		return res;
	}

	monsterWin()
	{
		for(const monster of this.#monsters)
		{
			monster.inCombat = false;
		}
		Server.combatOver(this.#position);
		clearInterval(this.#playerTurnTimeoutID);
	}

	removePlayer(player)
	{
		this.#players = this.#players.filter((x)=>x!==player);
		this.checkForMonsterTurn(); //probably a good idea?
	}

	playerIn(player)
	{
		return this.#in(this.#players, player);
	}

	monsterIn(monster)
	{
		return this.#in(this.#monsters, monster);
	}

	#in(list, creature)
	{
		return indexOfNumber(list, creature.number) !== -1;
	}
}

//exports
exports.Combat = Combat;