# Memes with Friends

## SERVER RECEIVED FROM CLIENT - Socket Routes

### `join, function(username)`
- Adds player to game state & generates unique playerId
- Stores username in socket
- Generates initial deck for player
- responds to client socket route **`opponentJoined`** with username

### `start, function()`
- Starts game
- Responds to client socket route **`started`** with "started"

### `playCard, function(cardUrl)`
- Creates new card `newCard`

  ``` 
    {
    playerId: socket.playerId,
    image   : cardUrl.image
    }
  ```
 - Pushes `newCard` to game pile (tracks current round's submitted cards)
 - Broadcasts (everyone but played socket) to **`cardPlayed`** socket route `newCard` object
 
 ### `between, function()`
- Responds to client socket route `betweened` with `game.pile`

 ### `requestCard, function()`
- Fetches new card from Google and responds to client on **`cardRequested`** socket route with a url (just string)

 ### `winner, function(url)`
- Calculates winners for given url
- Updates the scores for the winning players
- Responds on **`usersWon`** with the following object:
```
 {
   judge      : socket.username,
   winners    :  winnerUsernames,
   image      :  url,
   round      :  game.round
   allScores  :  {
                    username: <string>, 
                    score: <number>
                 }
 }
```

### `confirmWin, function()`
- Increases `game.confirmations` by 1 for each socket hit on this route
- Waits for as many confirmations as there are players
- Calculates **next judge**, moves game state to **next round**, and emits a response to the client route **`winConfirmed`** after x seconds

 ### `requestScores, function()`
- Returns scores on  **`scoresRequested`** with the following object:
```
  {
      username: <string>, 
      score: <number>
   }

```

End of Server socket routes

## CLIENT RECEIVED FROM SERVER - Socket Routes
### `joined, function({object})`
`object` variable:
- **judge** : string
- **id** : string
- **username** : string
- **players** : array
- **cards** : array
