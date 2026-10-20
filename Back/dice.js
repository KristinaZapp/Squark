function randInt(min, max)
{
	return Math.floor(Math.random() * (max - min + 1) + min);
}

function d6()
{
	return randInt(1,6);
}

exports.randInt = randInt;
exports.d6 = d6;
