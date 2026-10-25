//imports
const Dice = require("./dice.js");

class Creature
{
	position;
	number;

	#health;
	#maxHealth;
	#attack;
	#speed;
	#defence;

	//constructor
	constructor(health, attack, speed, defence, position)
	{
		this.#health = health;
		this.#maxHealth = health;
		this.#attack = attack;
		this.#speed = speed;
		this.#defence = defence;
		this.position = position;
	}

	//basic getters
	get health()
	{
		return this.#health;
	}

	get maxHealth()
	{
		return this.#maxHealth;
	}

	get attack()
	{
		return this.#attack;
	}

	get speed()
	{
		return this.#speed;
	}

	get defence()
	{
		return this.#defence;
	}

	get toMessage()
	{
		return this.number + "," + this.#health + "," + this.#maxHealth;
	}

	//deal damage
	damage(dmg)
	{
		this.#health -= dmg;
		this.#health = Math.max(this.#health, 0);
	}

	//heal
	//currently unused but I should add something that uses it
	heal(amount)
	{
		this.#health += amount;
		this.#health = Math.min(this.#health, this.#maxHealth);
	}

	kill()
	{
		this.#health = 0;
	}
}

class Character extends Creature
{
	socket;
	#active;

	constructor(socket, position, health, attack, speed, defence)
	{
		//I know this is bad but it's good enough for now
		if(health === undefined)
		{
			super(Dice.randInt(10,15), Dice.randInt(5,9), Dice.randInt(6,10), Dice.randInt(6,10), position);
			this.#active = true;
		}
		else
		{
			super(health, attack, speed, defence, position);
			this.#active = false;
		}
		this.socket = socket;
	}

	get active()
	{
		return this.#active;
	}

	send(msg)
	{
		this.socket.send(msg);
	}

	activate()
	{
		this.#active = true;
	}

	deactivate()
	{
		this.#active = false;
	}

}

const ALL_OPTIONS = ["left", "right", "up", "down"];

//class for any creature that automatically moves
class AutoMovingCreature extends Creature
{
	movementIntervalID;

	stopMoving()
	{
		clearInterval(this.movementIntervalID);
	}

	nextRoom(options)
	{
		const optionsArray = [];

		//this feels hacky, but without dictionary support I can't think of a better way to do it
		for(let option of ALL_OPTIONS)
		{
			if(options[option] !== undefined)
			{
				optionsArray.push(option);
			}
		}

		return options[optionsArray[Dice.randInt(0,optionsArray.length-1)]];
	}
}

class NPC extends AutoMovingCreature
{
	//returns the number of the monster to be attacked next
	//TODO a lot of work on this
	target(options)
	{
		const index = Dice.randInt(0, options.length-1);
		return options[index].number;
	}
}

class Monster extends AutoMovingCreature
{
	#name;
	#inCombat;

	constructor(health, attack, speed, defence, position, name)
	{
		super(health, attack, speed, defence, position);
		this.#name = name;
		this.#inCombat = false;
	}

	get name()
	{
		return this.#name;
	}

	get toMessage()
	{
		return super.toMessage + "," + this.#name;
	}

	damage(dmg)
	{
		super.damage(dmg);
		if(this.health === 0)
		{
			this.stopMoving();
		}
	}

	kill()
	{
		super.kill();
		this.stopMoving();
	}

	//returns the player number of the player to be attacked next
	target(options)
	{
		const index = Dice.randInt(0, options.length-1);
		return options[index].number;
	}

	get inCombat()
	{
		return this.#inCombat;
	}

	set inCombat(val)
	{
		if(typeof val === "boolean") this.#inCombat = val;
	}
}

//TODO implement monster behaviour (override target and nextRoom)

class Angel extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(9,12), Dice.randInt(9,12), Dice.randInt(9,12), Dice.randInt(9,12), position, "Angel");
		else
			super(health, attack, speed, defence, position, "Angel");
	}
}

class ClownBeetle extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(1,3), Dice.randInt(1,3), Dice.randInt(1,3), Dice.randInt(1,3), position, "Clown Beetle");
		else
			super(health, attack, speed, defence, position, "Clown Beetle");
	}
}

class CrystalBall extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(1,3), Dice.randInt(9,12), Dice.randInt(4,6), Dice.randInt(1,3), position, "Crystal Ball");
		else
			super(health, attack, speed, defence, position, "Crystal Ball");
	}
}

class Kiwwwi extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(4,6), Dice.randInt(1,3), Dice.randInt(1,3), Dice.randInt(4,6), position, "Kiwwwi");
		else
			super(health, attack, speed, defence, position, "Kiwwwi");
	}
}

class MaskBat extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(1,3), Dice.randInt(1,3), Dice.randInt(9,12), Dice.randInt(9,12), position, "Mask Bat");
		else
			super(health, attack, speed, defence, position, "Mask Bat");
	}
}

class MaybeDeer extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(9,12), Dice.randInt(9,12), Dice.randInt(1,3), Dice.randInt(1,3), position, "Maybe Deer");
		else
			super(health, attack, speed, defence, position, "Maybe Deer")
	}
}

class NoEyes extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(4,6), Dice.randInt(1,3), Dice.randInt(9,12), Dice.randInt(4,6), position, "No Eyes");
		else
			super(health, attack, speed, defence, position, "No Eyes")
	}
}

class SeeingPlant extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(4,6), Dice.randInt(1,3), Dice.randInt(1,3), Dice.randInt(4,6), position, "Seeing Plant");
		else
			super(health, attack, speed, defence, position, "Seeing Plant");
	}
}

class Seraphim extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(4,6), Dice.randInt(4,6), Dice.randInt(4,6), Dice.randInt(4,6), position, "Seraphim");
		else
			super(health, attack, speed, defence, position, "Seraphim");
	}
}

class Shade extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(1,3), Dice.randInt(1,3), Dice.randInt(9,12), Dice.randInt(4,6), position, "Shade");
		else
			super(health, attack, speed, defence, position, "Shade");
	}
}

class TempleKeeper extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(1,3), Dice.randInt(4,6), Dice.randInt(1,3), Dice.randInt(4,6), position, "Temple Keeper");
		else
			super(health, attack, speed, defence, position, "Temple Keeper");
	}
}

class TempleSecurity extends Monster
{
	constructor(position, health, attack, speed, defence)
	{
		if(health === undefined)
			super(Dice.randInt(4,6), Dice.randInt(9,12), Dice.randInt(4,6), Dice.randInt(9,12), position, "Temple Security");
		else
			super(health, attack, speed, defence, position, "Temple Security");
	}
}

const monsterTypes = [Angel, ClownBeetle, CrystalBall, Kiwwwi, MaskBat, MaybeDeer, NoEyes, SeeingPlant, Seraphim, Shade, TempleKeeper, TempleSecurity];

//exports
exports.Character = Character;
exports.NPC = NPC;
exports.MonsterTypes = monsterTypes;