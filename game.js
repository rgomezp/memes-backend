var _ = require('underscore');
var persist = require('./persist');
var Card = require('./card');
var Player = require('./player');
var _ = require('underscore');
var Concepts = require('./queries');
var axios = require('axios');

var readGame = false;

class Game {
  constructor(name, rounds, username) {
    this.creator = username;
    this.name = name;
    this.maxRounds = rounds;               // max rounds
    this.isStarted = false;
    this.players = {};                  // contains entire player objects (key equals playerId [also socket id])
    this.playerOrder = [];              // order of players (ids)
    this.playerUsernames = [];          // order of players (usernames)
    this.pile = [];                     // contains current round's cards
    this.round = 1;
    this.concepts = _.shuffle(Concepts.queries);
    this.confirmations = 0;            // used to track socket receipts of winner (need as many as number of players to begin next round)
    this.shiftNQuery(15);              // 10=shuffle 0-9 spots, replace with 0 to not shuffle on first round.
    this.colors = ['#18dcff', '#fff200', '#ff4d4d', '#cd84f1','#3ae374', '#ffb8b8', '#ffaf40', '#67e6dc'];
    this.winningObjects = [];
  }

  getGameCreator(){return this.creator}

  updateWinningObjects(winners, url){
    this.winningObjects[this.winningObjects.length-1].usernames = winners;
    this.winningObjects[this.winningObjects.length-1].url = url;
    console.log("winning objects: \n----------\n", this.winningObjects);
  }

  getWinningObjects(){
    return this.winningObjects;
  }

  getGameState(){
    console.log('\n\n--------GAME STATE--------');
    console.log('confirmations: ', this.confirmations);
    console.log('playerOrder: ', this.playerOrder);
    console.log('round number', this.round);
    console.log('\nPlayers: ', this.players);
    console.log('\npile_length:', this.pile.length);
    console.log('pile: ', this.pile);
    console.log('------- END GAME STATE-----\n\n');

  }

  getColor(){
    return this.colors.pop();
  }

  // how many players are in the game
  playerCount(){
    return Object.keys(this.players).length;
  }

  // get game winner
  getWinner(){
    console.log("getting winner");
    var maxScore = -Infinity;
    var winning = [];
    this.playerOrder.forEach((id)=>{
      let current = this.players[id].score;
      if(current >= maxScore) {
        maxScore = current;
        winning.push(this.players[id].username);
      }
    });
    return winning;
  }

  // check if game is over, return winner
  checkEndState(){
    if(this.round == this.maxRounds){
      return this.getWinner();
    }
  }

  // checks if the username is unique
  isUnique(username){
    for(var obj in this.players){
      if(this.players[obj].username == username) return false;
    }
    return true;
  }

  // returns current judge username
  currentJudgeUsername() {
    //this.getGameState()
    if (this.playerOrder.length!==0) {
      return this.players[this.playerOrder[0]].username;
    } else {
      return;
    }
  }

  // returns array of current player order (usernames)
  getUsernamesInOrder(){
    try{
      var order = [];
      // for id in playerOrder, get the username of the player, add to an array, return the array
      for(let i=0; i<this.playerOrder.length; i++){
        let color = this.players[this.playerOrder[i]].color;
        let username = this.players[this.playerOrder[i]].username;
        var obj = {username: username, color: color}
        order.push(obj);
      }
      return order;
    }catch(err){
      console.log("Something went wrong:", err);
    }
  }

  getUserAndColor(playerId){
    let player = this.players[playerId];
    var obj = {username: player.username, color: player.color}
    return obj;
  }

  // adds a player to the game
  addPlayer(username) {
    if(!this.isUnique(username)){
      throw "Username is not unique";
    }else if(username.trim() == ''){
      throw "Username is empty"
    }else{
      var new_player = new Player(username, this.colors.pop());
      this.playerOrder.push(new_player.id);         // player order stores the order by playerId, part of the Player object
      this.players[new_player.id] = new_player;
      this.playerUsernames.push(username);
      return new_player.id;                         // returns the player's id
    }
  }

  // deletes the player from the game based on the playerId
  deletePlayer(playerId) {
    if(!playerId) return;
    console.log("Deleting user... ", this.players[playerId].username);
    //this.getGameState();


    // remove playerUsername
    this.playerUsernames = this.playerUsernames.filter((username)=>{
      return this.players[playerId].username !== username
    })

    // remove playerId
    this.playerOrder = this.playerOrder.filter((id)=>{
      return id!==playerId
    })

    // remove playerObject
    delete this.players[playerId];
  }

  startGame() {
    if(this.isStarted){
      return "Game has already started";
    }else if(this.playerCount() < 2){
      return "Not enough people to start game";
    }else{
      this.winningObjects.push({concept:this.concepts[0]});   // push the first concept into the
                                                              // winning objects array
      this.isStarted = true;
    }
  }

  updateScores(playerIds){
    try{
      console.log('updating scores');
      playerIds.forEach((id) =>{
        this.players[id].score = this.players[id].score + 1;
      });
      return this.checkEndState();
    }catch(err){
      console.log("updating scores error:", err);
    }

  }

  getScores(){
    return this.playerOrder.map((playerId) => {
      return ({username: this.players[playerId].username, score: this.players[playerId].score})
    });
  }

  shiftNQuery(n) {
    for (let i=1; i<=(Math.floor(Math.random()*n)); i++) {
      var concept = this.concepts.shift();
      this.concepts.push(concept);
    }
    this.concepts = _.shuffle(this.concepts);
  }

  nextRound() {
    this.round++;

    // shift the order array by one
    var front = this.playerOrder.shift();
    this.playerOrder.push(front);

    // shift the queries array by one
    var shift1query = () => {
      var concept = this.concepts.shift();
      this.concepts.push(concept);
    }

    for (var i=0; i<=Math.floor(Math.random()*5)+1; i++) {
      shift1query();
    }

    this.winningObjects.push({concept:this.concepts[0]});     // push the new concept into the
                                                              // winning objects array

    this.pile = [];   // reset pile
    this.confirmations = 0;

    // this.getGameState();
    return this.playerOrder[0];   // returns next judge
  }

  /*
  * argument: playerId to add a strike to
  * returns : if player has three strikes, boot from game
  */
  addStrike(playerId){
    var willKick = this.players[playerId].addStrike();
    if(willKick){
      this.deletePlayer(playerId);
    }
    return willKick;
  }
}
module.exports = Game;
