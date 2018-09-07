var crypto = require("crypto");

class Player {
  constructor(username, color) {
    this.username = username,
    this.id = this.generateId(),
    this.score = 0,
    this.strikes = 0,
    this.color = color
  }

  generateId() {
    return crypto.randomBytes(10).toString('hex');
  }

  // returns whether player should be booted
  addStrike(){
    this.strikes++;
    if(this.strikes == 2) return true;
    else return false;
  }

  fromObject(object) {
    this.username = object.username;
    this.id = object.id;
    this.pile = object.pile.map(card => {
      var c = new Card();
      return c;
    });
  }

  toObject() {
    return {
      username: this.username,
      id: this.id,
      pile: this.pile.map(card => card.toObject())
    };
  }
}

module.exports = Player;
