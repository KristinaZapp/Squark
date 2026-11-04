//imports
const Dice = require("./dice.js");
const Server = require("./server.js");

//message constants
const TURN = "TURN";

//helper functions
function speedScore(arr)
{
	if(arr.length === 0)return 0;
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
	#npcs;
	#playersActed;
	#position;

	#playerTurnTimeoutID;

	constructor(position)
	{
		this.#players = [];
		this.#monsters = [];
		this.#npcs = [];
		this.#position = position;
	}

	addPlayer(newPlayer)
	{
		this.#players.push(newPlayer);
	}

	addMonster(newMonster)
	{
		this.#monsters.push(newMonster);
	}

	addNPC(newNPC)
	{
		this.#npcs.push(newNPC);
	}

	firstTurn()
	{
		const playerScore = speedScore(this.#players.concat(this.#npcs));
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
		//remove all the adventurers that are dead
		//maybe this can be removed?
		this.#players = this.#players.filter((x)=>x.health > 0);
		this.#npcs = this.#npcs.filter((x)=>x.health > 0);

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

			this.#playerTurnTimeoutID = setTimeout(this.npcTurn.bind(this), 30000);
		}

		//if there are npcs but no players, the npcs can go
		else if(this.#npcs.length > 0)
		{
			this.npcTurn();
		}

		//otherwise, the monsters win
		else
		{
			this.monsterWin();
		}
	}

	npcTurn()
	{
		this.#monsters = this.#monsters.filter((x)=>x.health>0);

		//each of the npcs takes a turn
		for(const npc of this.#npcs)
		{
			if(this.#monsters.length > 0)
			{
				//check if the npc flees
				const choice = Dice.randInt(0,this.#monsters.length);
				if(choice === this.#monsters.length) //means there's a uniform chance of taking each action, I think
				{
					const success = Dice.d6() + npc.speed >= speedScore(this.#monsters);
					if(success)
					{
						this.#npcs = this.#npcs.filter((x)=>x!==npc);
					}
					Server.sendFlee(npc.position, "NPC", success);
				}

				//otherwise, they attack one of the monsters
				else
				{
					const targetIndex = npc.target(this.#monsters);
					const target = this.#monsters[targetIndex];
					const dmg = Dice.d6() + npc.attack;
					Server.damageMonster(target.number, dmg, "NPC");
					this.#monsters = this.#monsters.filter((x)=>x.health>0);
				}
			}
		}
		this.monsterTurn();
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
				const adventurers = this.#players.concat(this.#npcs);
				if(adventurers.length > 0)
				{
					let targetIndex = monster.target(adventurers);
					if(targetIndex < this.#players.length)
					{
						const target = this.#players[targetIndex];
						const dmg = Dice.d6() + monster.attack;
						Server.damagePlayer(target.number, dmg, monster.number);
						this.#players = this.#players.filter((x)=>x.health > 0);
					}
					else
					{
						targetIndex = targetIndex - this.#players.length;
						const target = this.#npcs[targetIndex];
						const dmg = Dice.d6() + monster.attack;
						Server.damageNPC(target.number, dmg, monster.number);
						this.#npcs = this.#npcs.filter((x)=>x.health>0);
					}
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
		if(this.#players.length === 0 && this.#npcs.length === 0)
		{
			clearTimeout(this.#playerTurnTimeoutID);
			this.monsterWin();
		}
		else if(this.#playersActed.filter((x)=>!x).length === 0)
		{
			clearTimeout(this.#playerTurnTimeoutID);
			this.npcTurn();
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

		this.checkForMonsterTurn();
		
		return res;
	}

	monsterWin()
	{
		Server.combatOver(this.#position);
		clearInterval(this.#playerTurnTimeoutID);
	}

	removePlayer(player)
	{
		this.#players = this.#players.filter((x)=>x!==player);
		this.checkForMonsterTurn();
	}

	playerIn(player)
	{
		return this.#in(this.#players, player);
	}

	monsterIn(monster)
	{
		return this.#in(this.#monsters, monster);
	}

	npcIn(npc)
	{
		return this.#in(this.#npcs, npc);
	}

	#in(list, creature)
	{
		return indexOfNumber(list, creature.number) !== -1;
	}
}

//exports
exports.Combat = Combat;