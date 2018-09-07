var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

// route requires
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var axios = require('axios');

// game object
var Game = require('./game');

// set up server
var app = express();
var server = app.listen(process.env.PORT || 3000);
var io = require('socket.io')(server);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// middleware
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// use custom routes
app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// --------- GAME CONTAINER ----------
var games = {}
var count = 0;          // active socket connections

// --------- USER CONNECTS ---------
io.on('connection', function(socket) {
  var game;
  socket.emit('connected');
  count++;
  console.log("C O N N E C T I O N ", count);

    // --------- create a new room ---------
    socket.on('createRoom', (args)=>{
      var name = args.name;
      var rounds = args.rounds;
      var username = args.username;

      console.log("name:", name, "rounds:", rounds, "creator", username);

      var gameCode = generateCode();
      let whileCount = 0;

      // ensure unique code
      while(Object.keys(games).indexOf(gameCode) !== -1 && whileCount < 3){
        gameCode = generateCode();
        whileCount++;
      }

      // game doesn't exist create new game
      games[gameCode] = game = new Game(name, rounds, username);
      socket.join(gameCode);      // add socket to room
      socket.gameCode = gameCode;

      socket.emit('roomCreated', gameCode);
      console.log("room created", gameCode, Object.keys(games));
    });

    // --------- check if username is unique -------
    socket.on('usernameUnique', (args, next) => {
      try{
        var gameCode = args.gameCode;
        var username = args.username;

        if(games[gameCode].isUnique(username)) next(true);
        else next(false);
      }catch(err){
        console.log(err);
      }
    })

    // --------- join a specific room (args = {gameCode, username}) ---------
    socket.on('joinRoom', (args) => {
        var gameCode = args.gameCode;
        var username = args.username;
        console.log(username, "joining", gameCode);
        try{
          if(Object.keys(games).indexOf(gameCode) !== -1){
            // game exists. join game
            game = games[gameCode];
            socket.join(gameCode);      // add socket to room
            socket.gameCode = gameCode; // add gamecode name to the socket
          }

          socket.playerId = game.addPlayer(username);    // data = username
          socket.username = username;
          var cardArray = [];                            // cards array with meme pictures

          // DATA FETCH - get card urls
          axios.get(process.env.PHOTOS_SERVER)
          .then((response) => {
            var urls = response.data;

            // create cards and distribute them
            urls.forEach(function(url){
              cardArray.push(url.imageURL);
            });
            socket.emit('joined',{
              creator : game.creator,
              id      : socket.playerId,
              username: username,   // username
              playerOrder : game.getUsernamesInOrder(),
              cards   : cardArray,
              concept : game.concepts[0],
              gameName : game.name,
              maxRounds : game.maxRounds,
              round   : game.round,
              isStarted:game.isStarted
            });
            socket.broadcast.to(socket.gameCode).emit('opponentJoined', game.getUserAndColor(socket.playerId)); // send new opponent username, color
          })
          .catch((error)=>console.log('error here ->', error.message));
        }catch(err){
          console.log("Error joining room:", err);
        }
      }
    );

  // --------- someone left ---------
  socket.on('disconnect', function () {
    count--;
    console.log("CONNECTIONS", socket.username,"left ", count);

    try{
      // check if host left
      if(game.getGameCreator() == socket.username && !game.isStarted){
        io.to(socket.gameCode).emit('hostLeft');
      }

      // check if judge left
      if(game.playerOrder.length>0 && socket.username===game.currentJudgeUsername()) {
        console.log('judge left');
        io.to(socket.gameCode).emit('judgeLeft', game.currentJudgeUsername());
        ioNextRound(io, socket, game);
      }else{
        // if a non-judge left
        console.log("non-judge user left:", socket.username);
        io.to(socket.gameCode).emit('playerLeft', socket.username);
      }

      game.deletePlayer(socket.playerId);
      if(game.playerCount() <= 1){
        delete games[socket.gameCode];
        io.to(socket.gameCode).emit('alert', "Oh no! Too many players left the game");
      }
      console.log("games:", games);

    }catch(err){
      console.log("Disconnect error:", err);
    }
  });

  // --------- start the game ---------
  socket.on('start', function() {
    console.log('start game');
    if(socket.playerId == undefined){
      console.log('Error**: Not a player of game');
    }else{
      try{
        var startSuccess = game.startGame();  // returns null if successful, error message if not
        if(!startSuccess){
          io.to(socket.gameCode).emit('started', 'started');
        }else io.to(socket.gameCode).emit('alert', startSuccess)
      }catch(err){
        console.log('Start error', err);
      }
    }
  });

  // --------- someone played a card ---------
  socket.on('playCard', function(imageObj) {
    socket.emit('test', 'roger');
    if(socket.playerId == undefined){
      socket.emit('alert', 'You are not a player of the game');
      console.log('Error** You are not a player of the game');
    }else{
      try{
        var newCard = {playerId: socket.playerId, image: imageObj.image};
        game.pile.push(newCard);

        newCard = {username: socket.username, image: imageObj.image};   // overwrite newCard to contain username (for client)
        socket.broadcast.to(socket.gameCode).emit('cardPlayed', newCard);
      }catch(err){
        socket.emit('alert', err);
        console.log('Error** You are not a player of the game', err);
      }
    }
  });

  // --------- reached the between screen ---------
  socket.on('between', function(){
    socket.emit('betweened', game.pile);
  });

  // --------- round winner(s) has(ve) been chosen ---------
  socket.on('winner', function(url){
    try{
        // game.getGameState();
        socket.emit('test', 'roger');
        //game.getGameState();
        var winnerIds = [];

        // if url is winner, push Id of players that chose that url
        game.pile.forEach((card) => {
          if(card.image === url){
            winnerIds.push(card.playerId);
          }
        });

        // send back the winning player usernames (for the round)
        var winnerUsernames = [];
        winnerIds.forEach((id) => {
          if(game.players[id]){   // makes sure the player hasn't left in the middle of the game
            winnerUsernames.push(game.players[id].username);
          }
        });

        // update winning winningObjects
        game.updateWinningObjects(winnerUsernames, url);

        // updateScores calls checkEndState which checks round which gets winner if game is over
        let gameWinner = game.updateScores(winnerIds);
        if(!gameWinner){
          io.to(socket.gameCode).emit('usersWon', {winners: winnerUsernames, image:url, allScores: game.getScores()});
        }else{
          // someone won
          console.log("Game ends!!!!", gameWinner);
          io.to(socket.gameCode).emit('endGame', {scores:game.getScores(), winner:game.getWinner(), winningObjects: game.getWinningObjects()})
        }
      }catch(err){
        console.log(err);
      }
  });

  // --------- client requested a new card ---------
  socket.on('requestCard', function(){
    axios.get('https://still-lake-93484.herokuapp.com/getOneSpecialCardThenEraseWithFallback')
    .then((response) => {
      var url = response.data.imageURL;

      // create cards and distribute them
      socket.emit('cardRequested', url);
    })
    .catch((error)=>console.log('error', error.message));
  });

  // --------- every client must confirm win before moving to next round ---------
  socket.on('confirmWin', function(){
    console.log('confirm win');
    game.confirmations++;
    if(game.confirmations===game.playerOrder.length){
      game.nextRound();       // updates round in state
      ioNextRound(io, socket, game);  // updates clients on round
    }
  });

  // --------- send scores to client ---------
  socket.on('requestScores', function(){
    socket.emit('scoresRequested', game.getScores());
  });

  // ---------- time runs out on judge -----------
  socket.on('judgeExpired', function(){
    try{
      console.log('judge expired');
      var willKick = game.addStrike(socket.playerId);
      game.nextRound();
      ioNextRound(io, socket, game);
      io.to(socket.gameCode).emit('expiredJudge', willKick);    // need to notify other users that judge left
      console.log('judgeExpired', willKick, socket.username);
      if(willKick){
        console.log("will kick expired judge");
        socket.leave(socket.gameCode);               // leave room
      }
    }catch(err){
      console.log(err);
    }
  });

  // ---------- time runs out on player -----------
  socket.on('playerExpired', function(){
    try{
      var willKick = game.addStrike(socket.playerId);
      console.log('playerExpired', willKick, socket.username);
      io.to(socket.gameCode).emit('expiredPlayer', {willKick:willKick, player: socket.username});    // need to notify other users who ran out of time
      if(willKick){
        console.log("will kick expired player");
        socket.leave(socket.gameCode);               // leave room
      }
    }catch(err){
      console.log(err);
    }

  });

  // ---------- request a new code ------------
  socket.on('codeRequest', function(){
    socket.emit('roomCreated', generateCode());
  });

  // ---------- check if game exists -----------
  socket.on('checkGame', (code, next) => {
    if(Object.keys(games).indexOf(code) === -1){
      socket.emit('alert', "Code does not exist")
      next(false);
    }else{
      console.log(code, 'true');
      next(true);
    }
  });

  // ---------- leave game ------------
  //
  socket.on('leaveGame', ()=>{
    // host left, destroy game
    if(game.getGameCreator() == socket.username && !game.isStarted){
      io.to(socket.gameCode).emit('hostLeft');
      io.to(socket.gameCode).emit('alert', "Host left the game");
      delete games[socket.gameCode];
    }else{
      // player left, alert others
      io.to(socket.gameCode).emit('playerLeft', socket.username);
      game.deletePlayer(socket.playerId);
    }
  });
});


// ---------- HELPER FUNCTIONS ------------

// socket-side next round
function ioNextRound(io, socket, game){
  // wait 5 seconds, start next round
  console.log("Going to next round....");
  console.log(games[socket.gameCode].getUsernamesInOrder());
  setTimeout(function(){
    io.to(socket.gameCode).emit('nextRound', {
      playerOrder: game.getUsernamesInOrder(),
      concept : game.concepts[0],
      round   : game.round
    });
  }, 5000);
}

// generate game code
function generateCode(){
  var code = "";
  for(let i=0; i<3; i++){
    code+=String.fromCharCode(65+Math.floor(Math.random()*25))
  }
  return code;
}


console.log(new Date());
module.exports = app;
