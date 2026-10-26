//imports
const Server = require("./server.js");
const Creatures = require("./creatures.js")

class Registry
{
	#arr;

	constructor()
	{
		this.#arr = [];
	}

	add(newCreature)
	{
		if(newCreature.number === undefined)
		{
			let i = 0;
			while(this.#arr[i] !== undefined && this.#arr[i] !== null)
			{
				i++;
			}
			newCreature.number = i;
			this.#arr[i] = newCreature;
		}
		else
		{
			if(this.#arr[newCreature.number] === undefined || this.#arr[newCreature.number] === null)
			{
				this.#arr[newCreature.number] = newCreature;
			}
			else
			{
				console.log("failed to load creature " + newCreature.number);
			}
		}
	}

	get(i)
	{
		if(this.#arr[i] === undefined)
		{
			return null;
		}
		else
		{
			return this.#arr[i];
		}
	}

	clear(i)
	{
		//if it's a player, inform the server that this player is gone
		if(this.#arr[i] instanceof Creatures.Character)
			Server.playerGone(this.#arr[i]);

		//clear the spot in the array
		this.#arr[i] = null;
	}

	//deactivate all the players associated with a given socket
	deactivateBySocket(socket)
	{
		for(let i=0; i < this.length; i++)
		{
			if(this.#arr[i] !== null && this.#arr[i].socket === socket)
			{
				this.#arr[i].deactivate();
				Server.playerGone(this.#arr[i]);
			}
		}
	}

	get length()
	{
		return this.#arr.length;
	}

	get numActive()
	{
		return this.#arr.filter((x)=>x!=null).length;
	}
}

exports.Registry = Registry;
